// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SecureVote — educational weighted voting contract
 * @notice EDUCATIONAL PROTOTYPE for the course "Introduction to Finance" (AITU).
 *         Deploy ONLY to a local Hardhat network. Not audited. Not for real elections.
 *
 * Design summary (see docs/ARCHITECTURE.md):
 *  - DEFAULT_ADMIN_ROLE grants / revokes ORGANIZER_ROLE. It has NO function that can
 *    change, add or remove votes.
 *  - ORGANIZER_ROLE may create sessions. Only the organizer who created a session may
 *    register voters for it and open it.
 *  - Lifecycle: Created (registration phase) -> Open -> Closed. No other transitions.
 *  - Voter registration and configuration are frozen once a session is opened.
 *  - A vote is accepted only when: session Open, startTime <= now < endTime,
 *    caller registered for THIS session, caller has not voted, option index valid.
 *  - Results are derived exclusively from accepted votes stored by this contract.
 *
 * PRIVACY WARNING: this is a TRANSPARENT ballot. Every VoteCast event publicly links a
 * voter address to the chosen option and weight. It is NOT a secret or anonymous ballot.
 */
contract SecureVote is AccessControl {
    // ---------------------------------------------------------------------
    // Roles and limits
    // ---------------------------------------------------------------------

    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");

    uint256 public constant MIN_OPTIONS = 2;
    uint256 public constant MAX_OPTIONS = 10;
    uint256 public constant MAX_TITLE_BYTES = 160;
    uint256 public constant MAX_LABEL_BYTES = 80;
    /// @dev Bounds the gas cost of a single registration transaction.
    uint256 public constant MAX_REGISTRATION_BATCH = 100;
    uint256 public constant MAX_DURATION = 366 days;
    uint16 public constant BPS_DENOMINATOR = 10_000;

    // ---------------------------------------------------------------------
    // Types and storage
    // ---------------------------------------------------------------------

    enum State {
        None, // session id does not exist
        Created, // registration / configuration phase
        Open, // voting allowed inside [startTime, endTime)
        Closed // final; results available
    }

    struct Session {
        address organizer;
        uint64 startTime;
        uint64 endTime;
        uint16 quorumBps; // minimum participating weight, in basis points of eligible weight
        State state;
        uint32 voterCount;
        uint32 votesCast;
        uint256 totalEligibleWeight;
        uint256 totalVotedWeight;
        string title;
        string[] optionLabels;
    }

    struct Voter {
        uint256 weight; // 0 means "not registered for this session"
        bool hasVoted;
    }

    /// @notice Number of sessions created; session ids are 1..sessionCount.
    uint256 public sessionCount;

    mapping(uint256 sessionId => Session) private _sessions;
    mapping(uint256 sessionId => mapping(address voter => Voter)) private _voters;
    mapping(uint256 sessionId => mapping(uint256 option => uint256)) private _optionWeight;
    mapping(uint256 sessionId => mapping(uint256 option => uint256)) private _optionVotes;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event SessionCreated(
        uint256 indexed sessionId,
        address indexed organizer,
        string title,
        string[] optionLabels,
        uint64 startTime,
        uint64 endTime,
        uint16 quorumBps
    );
    event VoterRegistered(uint256 indexed sessionId, address indexed voter, uint256 weight);
    event SessionOpened(uint256 indexed sessionId, address indexed organizer, uint32 voterCount, uint256 totalEligibleWeight);
    event VoteCast(uint256 indexed sessionId, address indexed voter, uint256 indexed optionIndex, uint256 weight);
    event SessionClosed(uint256 indexed sessionId, address indexed closedBy, uint32 votesCast, uint256 totalVotedWeight);

    // ---------------------------------------------------------------------
    // Errors (custom errors give clear, cheap revert reasons)
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error SessionNotFound(uint256 sessionId);
    error InvalidTitle();
    error InvalidOptionCount(uint256 count);
    error InvalidOptionLabel(uint256 index);
    error InvalidSchedule(uint64 startTime, uint64 endTime);
    error InvalidQuorum(uint16 quorumBps);
    error NotSessionOrganizer(uint256 sessionId, address caller);
    error InvalidState(uint256 sessionId, State expected, State actual);
    error EmptyBatch();
    error BatchTooLarge(uint256 size);
    error LengthMismatch(uint256 voters, uint256 weights);
    error InvalidVoter(address voter);
    error ZeroWeight(address voter);
    error VoterAlreadyRegistered(uint256 sessionId, address voter);
    error NoEligibleVoters(uint256 sessionId);
    error VotingNotStarted(uint256 sessionId, uint64 startTime);
    error VotingEnded(uint256 sessionId, uint64 endTime);
    error NotEligible(uint256 sessionId, address voter);
    error AlreadyVoted(uint256 sessionId, address voter);
    error InvalidOption(uint256 sessionId, uint256 optionIndex);
    error CloseNotAllowedYet(uint256 sessionId, uint64 endTime);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @param admin account that receives DEFAULT_ADMIN_ROLE (manages organizers).
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Modifiers / internal checks
    // ---------------------------------------------------------------------

    function _existing(uint256 sessionId) private view returns (Session storage s) {
        s = _sessions[sessionId];
        if (s.state == State.None) revert SessionNotFound(sessionId);
    }

    function _requireState(uint256 sessionId, Session storage s, State expected) private view {
        if (s.state != expected) revert InvalidState(sessionId, expected, s.state);
    }

    /// @dev Caller must be the session's organizer AND still hold ORGANIZER_ROLE.
    function _requireActiveOrganizer(uint256 sessionId, Session storage s) private view {
        if (msg.sender != s.organizer || !hasRole(ORGANIZER_ROLE, msg.sender)) {
            revert NotSessionOrganizer(sessionId, msg.sender);
        }
    }

    // ---------------------------------------------------------------------
    // Organizer actions
    // ---------------------------------------------------------------------

    /**
     * @notice Create a session in the Created (registration) state.
     * @param title        short public title (no personal data)
     * @param optionLabels 2..10 public option labels
     * @param startTime    unix seconds; votes earlier than this are rejected
     * @param endTime      unix seconds; votes at or after this are rejected
     * @param quorumBps    minimum turnout by weight in basis points (0 = no quorum)
     */
    function createSession(
        string calldata title,
        string[] calldata optionLabels,
        uint64 startTime,
        uint64 endTime,
        uint16 quorumBps
    ) external onlyRole(ORGANIZER_ROLE) returns (uint256 sessionId) {
        uint256 titleLen = bytes(title).length;
        if (titleLen == 0 || titleLen > MAX_TITLE_BYTES) revert InvalidTitle();

        uint256 n = optionLabels.length;
        if (n < MIN_OPTIONS || n > MAX_OPTIONS) revert InvalidOptionCount(n);
        for (uint256 i = 0; i < n; i++) {
            uint256 len = bytes(optionLabels[i]).length;
            if (len == 0 || len > MAX_LABEL_BYTES) revert InvalidOptionLabel(i);
        }

        if (endTime <= startTime || endTime <= block.timestamp || endTime - startTime > MAX_DURATION) {
            revert InvalidSchedule(startTime, endTime);
        }
        if (quorumBps > BPS_DENOMINATOR) revert InvalidQuorum(quorumBps);

        sessionId = ++sessionCount;
        Session storage s = _sessions[sessionId];
        s.organizer = msg.sender;
        s.title = title;
        s.startTime = startTime;
        s.endTime = endTime;
        s.quorumBps = quorumBps;
        s.state = State.Created;
        for (uint256 i = 0; i < n; i++) {
            s.optionLabels.push(optionLabels[i]);
        }

        emit SessionCreated(sessionId, msg.sender, title, optionLabels, startTime, endTime, quorumBps);
    }

    /**
     * @notice Register eligible voters and their weights. Only before the session opens.
     * @dev Duplicates are rejected (no silent weight changes). Batch size is bounded.
     */
    function registerVoters(
        uint256 sessionId,
        address[] calldata voters,
        uint256[] calldata weights
    ) external {
        Session storage s = _existing(sessionId);
        _requireActiveOrganizer(sessionId, s);
        _requireState(sessionId, s, State.Created);

        uint256 n = voters.length;
        if (n == 0) revert EmptyBatch();
        if (n > MAX_REGISTRATION_BATCH) revert BatchTooLarge(n);
        if (n != weights.length) revert LengthMismatch(n, weights.length);

        uint256 addedWeight = 0;
        for (uint256 i = 0; i < n; i++) {
            address voter = voters[i];
            uint256 weight = weights[i];
            if (voter == address(0)) revert InvalidVoter(voter);
            if (weight == 0) revert ZeroWeight(voter);
            Voter storage v = _voters[sessionId][voter];
            if (v.weight != 0) revert VoterAlreadyRegistered(sessionId, voter);
            v.weight = weight;
            addedWeight += weight;
            emit VoterRegistered(sessionId, voter, weight);
        }
        s.voterCount += uint32(n);
        s.totalEligibleWeight += addedWeight;
    }

    /// @notice Freeze configuration and start accepting votes (from startTime).
    function openSession(uint256 sessionId) external {
        Session storage s = _existing(sessionId);
        _requireActiveOrganizer(sessionId, s);
        _requireState(sessionId, s, State.Created);
        if (s.voterCount == 0) revert NoEligibleVoters(sessionId);
        if (block.timestamp >= s.endTime) revert VotingEnded(sessionId, s.endTime);

        s.state = State.Open;
        emit SessionOpened(sessionId, msg.sender, s.voterCount, s.totalEligibleWeight);
    }

    /**
     * @notice Close an open session. Allowed for the session organizer or an admin, and
     *         only once the voting window has ended OR every registered voter has voted.
     *         This stops an organizer from cutting voting short while voters remain.
     */
    function closeSession(uint256 sessionId) external {
        Session storage s = _existing(sessionId);
        if (msg.sender != s.organizer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotSessionOrganizer(sessionId, msg.sender);
        }
        _requireState(sessionId, s, State.Open);
        if (block.timestamp < s.endTime && s.votesCast < s.voterCount) {
            revert CloseNotAllowedYet(sessionId, s.endTime);
        }

        s.state = State.Closed;
        emit SessionClosed(sessionId, msg.sender, s.votesCast, s.totalVotedWeight);
    }

    // ---------------------------------------------------------------------
    // Voter action
    // ---------------------------------------------------------------------

    /// @notice Cast exactly one weighted vote for `optionIndex` in `sessionId`.
    function castVote(uint256 sessionId, uint256 optionIndex) external {
        Session storage s = _existing(sessionId);
        _requireState(sessionId, s, State.Open);
        if (block.timestamp < s.startTime) revert VotingNotStarted(sessionId, s.startTime);
        if (block.timestamp >= s.endTime) revert VotingEnded(sessionId, s.endTime);

        Voter storage v = _voters[sessionId][msg.sender];
        if (v.weight == 0) revert NotEligible(sessionId, msg.sender);
        if (v.hasVoted) revert AlreadyVoted(sessionId, msg.sender);
        if (optionIndex >= s.optionLabels.length) revert InvalidOption(sessionId, optionIndex);

        // Effects only — this function makes no external calls.
        v.hasVoted = true;
        uint256 weight = v.weight;
        _optionWeight[sessionId][optionIndex] += weight;
        _optionVotes[sessionId][optionIndex] += 1;
        s.totalVotedWeight += weight;
        s.votesCast += 1;

        emit VoteCast(sessionId, msg.sender, optionIndex, weight);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    struct SessionView {
        uint256 id;
        address organizer;
        string title;
        string[] optionLabels;
        uint64 startTime;
        uint64 endTime;
        uint16 quorumBps;
        State state;
        uint32 voterCount;
        uint32 votesCast;
        uint256 totalEligibleWeight;
        uint256 totalVotedWeight;
    }

    function getSession(uint256 sessionId) external view returns (SessionView memory) {
        Session storage s = _existing(sessionId);
        return
            SessionView({
                id: sessionId,
                organizer: s.organizer,
                title: s.title,
                optionLabels: s.optionLabels,
                startTime: s.startTime,
                endTime: s.endTime,
                quorumBps: s.quorumBps,
                state: s.state,
                voterCount: s.voterCount,
                votesCast: s.votesCast,
                totalEligibleWeight: s.totalEligibleWeight,
                totalVotedWeight: s.totalVotedWeight
            });
    }

    function getVoter(
        uint256 sessionId,
        address voter
    ) external view returns (bool registered, uint256 weight, bool hasVoted) {
        _existing(sessionId);
        Voter storage v = _voters[sessionId][voter];
        return (v.weight != 0, v.weight, v.hasVoted);
    }

    /**
     * @notice Final per-option results; only available after the session is Closed.
     * @dev Note: individual VoteCast events are public, so running tallies can be
     *      reconstructed by anyone before closure. Restricting this view is a UX rule,
     *      not a confidentiality guarantee.
     */
    function getResults(
        uint256 sessionId
    )
        external
        view
        returns (
            uint256[] memory optionWeights,
            uint256[] memory optionVotes,
            uint256 totalVotedWeight,
            uint256 totalEligibleWeight,
            bool quorumReached
        )
    {
        Session storage s = _existing(sessionId);
        _requireState(sessionId, s, State.Closed);
        uint256 n = s.optionLabels.length;
        optionWeights = new uint256[](n);
        optionVotes = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            optionWeights[i] = _optionWeight[sessionId][i];
            optionVotes[i] = _optionVotes[sessionId][i];
        }
        totalVotedWeight = s.totalVotedWeight;
        totalEligibleWeight = s.totalEligibleWeight;
        quorumReached = totalVotedWeight * BPS_DENOMINATOR >= totalEligibleWeight * s.quorumBps;
    }
}
