import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

// Lifecycle states as defined in SecureVote.State
const State = { None: 0n, Created: 1n, Open: 2n, Closed: 3n } as const;
const HOUR = 3600;
const OPTIONS = ["Approve", "Reject", "Abstain"];

/** Fresh contract + independent accounts for each test (EVM snapshot via loadFixture). */
async function deployFixture() {
  const [admin, organizer, otherOrganizer, alice, bob, carol, outsider] = await ethers.getSigners();
  const SecureVote = await ethers.getContractFactory("SecureVote");
  const contract = await SecureVote.deploy(admin.address);
  const ORGANIZER_ROLE = await contract.ORGANIZER_ROLE();
  await contract.connect(admin).grantRole(ORGANIZER_ROLE, organizer.address);
  await contract.connect(admin).grantRole(ORGANIZER_ROLE, otherOrganizer.address);
  return { contract, admin, organizer, otherOrganizer, alice, bob, carol, outsider, ORGANIZER_ROLE };
}

/** A session in the Created state with a voting window starting now. */
async function createdSessionFixture() {
  const base = await deployFixture();
  const now = await time.latest();
  const start = now;
  const end = now + 24 * HOUR;
  await base.contract.connect(base.organizer).createSession("FY2026 dividend policy", OPTIONS, start, end, 5000);
  return { ...base, sessionId: 1n, start, end };
}

/** Voters registered: alice=600, bob=300, carol=100 (total 1000). Session opened. */
async function openSessionFixture() {
  const base = await createdSessionFixture();
  const { contract, organizer, alice, bob, carol, sessionId } = base;
  await contract.connect(organizer).registerVoters(sessionId, [alice.address, bob.address, carol.address], [600, 300, 100]);
  await contract.connect(organizer).openSession(sessionId);
  return base;
}

describe("SecureVote", function () {
  describe("deployment and roles", function () {
    it("grants DEFAULT_ADMIN_ROLE to the constructor admin only", async function () {
      const { contract, admin, organizer } = await loadFixture(deployFixture);
      const ADMIN = await contract.DEFAULT_ADMIN_ROLE();
      expect(await contract.hasRole(ADMIN, admin.address)).to.equal(true);
      expect(await contract.hasRole(ADMIN, organizer.address)).to.equal(false);
    });

    it("rejects a zero-address admin", async function () {
      const F = await ethers.getContractFactory("SecureVote");
      await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(F, "ZeroAddress");
    });

    it("lets only the admin grant and revoke ORGANIZER_ROLE", async function () {
      const { contract, admin, outsider, alice, ORGANIZER_ROLE } = await loadFixture(deployFixture);
      await expect(contract.connect(outsider).grantRole(ORGANIZER_ROLE, alice.address))
        .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, await contract.DEFAULT_ADMIN_ROLE());
      await expect(contract.connect(admin).grantRole(ORGANIZER_ROLE, alice.address))
        .to.emit(contract, "RoleGranted")
        .withArgs(ORGANIZER_ROLE, alice.address, admin.address);
      await expect(contract.connect(admin).revokeRole(ORGANIZER_ROLE, alice.address)).to.emit(contract, "RoleRevoked");
      expect(await contract.hasRole(ORGANIZER_ROLE, alice.address)).to.equal(false);
    });
  });

  describe("session creation", function () {
    it("creates a session with a unique id and emits SessionCreated", async function () {
      const { contract, organizer } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(contract.connect(organizer).createSession("Board election", OPTIONS, now, now + HOUR, 0))
        .to.emit(contract, "SessionCreated")
        .withArgs(1n, organizer.address, "Board election", OPTIONS, now, now + HOUR, 0);
      await contract.connect(organizer).createSession("Second", ["Yes", "No"], now, now + HOUR, 0);

      const s1 = await contract.getSession(1);
      expect(s1.state).to.equal(State.Created);
      expect(s1.organizer).to.equal(organizer.address);
      expect(s1.optionLabels).to.deep.equal(OPTIONS);
      expect((await contract.getSession(2)).title).to.equal("Second");
      expect(await contract.sessionCount()).to.equal(2n);
    });

    it("rejects session creation by an account without ORGANIZER_ROLE", async function () {
      const { contract, outsider, admin, ORGANIZER_ROLE } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(contract.connect(outsider).createSession("x", OPTIONS, now, now + HOUR, 0))
        .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, ORGANIZER_ROLE);
      // The admin is not implicitly an organizer either.
      await expect(contract.connect(admin).createSession("x", OPTIONS, now, now + HOUR, 0)).to.be.revertedWithCustomError(
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("rejects fewer than two or more than ten options and empty labels", async function () {
      const { contract, organizer } = await loadFixture(deployFixture);
      const now = await time.latest();
      const c = contract.connect(organizer);
      await expect(c.createSession("t", ["Only"], now, now + HOUR, 0))
        .to.be.revertedWithCustomError(contract, "InvalidOptionCount")
        .withArgs(1);
      const eleven = Array.from({ length: 11 }, (_, i) => `Option ${i}`);
      await expect(c.createSession("t", eleven, now, now + HOUR, 0))
        .to.be.revertedWithCustomError(contract, "InvalidOptionCount")
        .withArgs(11);
      await expect(c.createSession("t", ["Yes", ""], now, now + HOUR, 0))
        .to.be.revertedWithCustomError(contract, "InvalidOptionLabel")
        .withArgs(1);
    });

    it("rejects invalid schedules, empty titles and quorum above 100%", async function () {
      const { contract, organizer } = await loadFixture(deployFixture);
      const now = await time.latest();
      const c = contract.connect(organizer);
      await expect(c.createSession("t", OPTIONS, now + HOUR, now + HOUR, 0)).to.be.revertedWithCustomError(
        contract,
        "InvalidSchedule",
      ); // end == start
      await expect(c.createSession("t", OPTIONS, now - 2 * HOUR, now - HOUR, 0)).to.be.revertedWithCustomError(
        contract,
        "InvalidSchedule",
      ); // already ended
      await expect(c.createSession("t", OPTIONS, now, now + 400 * 24 * HOUR, 0)).to.be.revertedWithCustomError(
        contract,
        "InvalidSchedule",
      ); // longer than MAX_DURATION
      await expect(c.createSession("", OPTIONS, now, now + HOUR, 0)).to.be.revertedWithCustomError(contract, "InvalidTitle");
      await expect(c.createSession("t", OPTIONS, now, now + HOUR, 10_001))
        .to.be.revertedWithCustomError(contract, "InvalidQuorum")
        .withArgs(10_001);
    });
  });

  describe("voter registration", function () {
    it("registers voters with weights and emits VoterRegistered", async function () {
      const { contract, organizer, alice, bob, sessionId } = await loadFixture(createdSessionFixture);
      await expect(contract.connect(organizer).registerVoters(sessionId, [alice.address, bob.address], [70, 30]))
        .to.emit(contract, "VoterRegistered")
        .withArgs(sessionId, alice.address, 70)
        .and.to.emit(contract, "VoterRegistered")
        .withArgs(sessionId, bob.address, 30);

      const s = await contract.getSession(sessionId);
      expect(s.voterCount).to.equal(2);
      expect(s.totalEligibleWeight).to.equal(100n);
      const v = await contract.getVoter(sessionId, alice.address);
      expect(v.registered).to.equal(true);
      expect(v.weight).to.equal(70n);
      expect(v.hasVoted).to.equal(false);
    });

    it("rejects registration by anyone other than the session's organizer", async function () {
      const { contract, otherOrganizer, outsider, admin, alice, sessionId } = await loadFixture(createdSessionFixture);
      for (const caller of [outsider, otherOrganizer, admin]) {
        await expect(contract.connect(caller).registerVoters(sessionId, [alice.address], [10]))
          .to.be.revertedWithCustomError(contract, "NotSessionOrganizer")
          .withArgs(sessionId, caller.address);
      }
    });

    it("rejects registration by an organizer whose role was revoked", async function () {
      const { contract, admin, organizer, alice, sessionId, ORGANIZER_ROLE } = await loadFixture(createdSessionFixture);
      await contract.connect(admin).revokeRole(ORGANIZER_ROLE, organizer.address);
      await expect(contract.connect(organizer).registerVoters(sessionId, [alice.address], [10])).to.be.revertedWithCustomError(
        contract,
        "NotSessionOrganizer",
      );
    });

    it("rejects zero voting weight, zero address, duplicates and malformed batches", async function () {
      const { contract, organizer, alice, bob, sessionId } = await loadFixture(createdSessionFixture);
      const c = contract.connect(organizer);
      await expect(c.registerVoters(sessionId, [alice.address], [0]))
        .to.be.revertedWithCustomError(contract, "ZeroWeight")
        .withArgs(alice.address);
      await expect(c.registerVoters(sessionId, [ethers.ZeroAddress], [5])).to.be.revertedWithCustomError(
        contract,
        "InvalidVoter",
      );
      await expect(c.registerVoters(sessionId, [alice.address, bob.address], [5]))
        .to.be.revertedWithCustomError(contract, "LengthMismatch")
        .withArgs(2, 1);
      await expect(c.registerVoters(sessionId, [], [])).to.be.revertedWithCustomError(contract, "EmptyBatch");
      await c.registerVoters(sessionId, [alice.address], [5]);
      await expect(c.registerVoters(sessionId, [alice.address], [9]))
        .to.be.revertedWithCustomError(contract, "VoterAlreadyRegistered")
        .withArgs(sessionId, alice.address);
      // weight is unchanged after the failed attempt
      expect((await contract.getVoter(sessionId, alice.address)).weight).to.equal(5n);
    });

    it("rejects registration batches larger than MAX_REGISTRATION_BATCH", async function () {
      const { contract, organizer, sessionId } = await loadFixture(createdSessionFixture);
      const n = Number(await contract.MAX_REGISTRATION_BATCH()) + 1;
      const voters = Array.from({ length: n }, () => ethers.Wallet.createRandom().address);
      await expect(
        contract.connect(organizer).registerVoters(
          sessionId,
          voters,
          voters.map(() => 1),
        ),
      ).to.be.revertedWithCustomError(contract, "BatchTooLarge");
    });

    it("prevents registration after the session is opened", async function () {
      const { contract, organizer, outsider, sessionId } = await loadFixture(openSessionFixture);
      await expect(contract.connect(organizer).registerVoters(sessionId, [outsider.address], [1000]))
        .to.be.revertedWithCustomError(contract, "InvalidState")
        .withArgs(sessionId, State.Created, State.Open);
    });

    it("rejects operations on a non-existent session", async function () {
      const { contract, organizer, alice } = await loadFixture(deployFixture);
      await expect(contract.connect(organizer).registerVoters(42, [alice.address], [1]))
        .to.be.revertedWithCustomError(contract, "SessionNotFound")
        .withArgs(42);
      await expect(contract.getSession(42)).to.be.revertedWithCustomError(contract, "SessionNotFound");
    });
  });

  describe("opening", function () {
    it("opens a session with registered voters and freezes configuration", async function () {
      const { contract, organizer, alice, sessionId } = await loadFixture(createdSessionFixture);
      await contract.connect(organizer).registerVoters(sessionId, [alice.address], [10]);
      await expect(contract.connect(organizer).openSession(sessionId))
        .to.emit(contract, "SessionOpened")
        .withArgs(sessionId, organizer.address, 1, 10);
      expect((await contract.getSession(sessionId)).state).to.equal(State.Open);
      await expect(contract.connect(organizer).openSession(sessionId)).to.be.revertedWithCustomError(contract, "InvalidState");
    });

    it("refuses to open a session without voters, by a non-organizer, or after its end time", async function () {
      const { contract, organizer, outsider, alice, sessionId, end } = await loadFixture(createdSessionFixture);
      await expect(contract.connect(organizer).openSession(sessionId))
        .to.be.revertedWithCustomError(contract, "NoEligibleVoters")
        .withArgs(sessionId);
      await contract.connect(organizer).registerVoters(sessionId, [alice.address], [10]);
      await expect(contract.connect(outsider).openSession(sessionId)).to.be.revertedWithCustomError(
        contract,
        "NotSessionOrganizer",
      );
      await time.increaseTo(end);
      await expect(contract.connect(organizer).openSession(sessionId)).to.be.revertedWithCustomError(contract, "VotingEnded");
    });
  });

  describe("voting", function () {
    it("accepts a vote from an eligible voter and emits VoteCast with the voter's weight", async function () {
      const { contract, alice, sessionId } = await loadFixture(openSessionFixture);
      await expect(contract.connect(alice).castVote(sessionId, 0))
        .to.emit(contract, "VoteCast")
        .withArgs(sessionId, alice.address, 0, 600);
      const v = await contract.getVoter(sessionId, alice.address);
      expect(v.hasVoted).to.equal(true);
      const s = await contract.getSession(sessionId);
      expect(s.votesCast).to.equal(1);
      expect(s.totalVotedWeight).to.equal(600n);
    });

    it("rejects a duplicate vote from the same voter, even for a different option", async function () {
      const { contract, alice, sessionId } = await loadFixture(openSessionFixture);
      await contract.connect(alice).castVote(sessionId, 0);
      await expect(contract.connect(alice).castVote(sessionId, 1))
        .to.be.revertedWithCustomError(contract, "AlreadyVoted")
        .withArgs(sessionId, alice.address);
      expect((await contract.getSession(sessionId)).totalVotedWeight).to.equal(600n);
    });

    it("rejects a vote from an ineligible voter", async function () {
      const { contract, outsider, organizer, admin, sessionId } = await loadFixture(openSessionFixture);
      for (const caller of [outsider, organizer, admin]) {
        await expect(contract.connect(caller).castVote(sessionId, 0))
          .to.be.revertedWithCustomError(contract, "NotEligible")
          .withArgs(sessionId, caller.address);
      }
    });

    it("keeps eligibility per session (registered in one session is not eligible in another)", async function () {
      const { contract, organizer, alice, end } = await loadFixture(openSessionFixture);
      const now = await time.latest();
      await contract.connect(organizer).createSession("Other", ["A", "B"], now, end, 0);
      await contract.connect(organizer).registerVoters(2, [organizer.address], [1]);
      await contract.connect(organizer).openSession(2);
      await expect(contract.connect(alice).castVote(2, 0)).to.be.revertedWithCustomError(contract, "NotEligible");
    });

    it("rejects an invalid option index", async function () {
      const { contract, alice, sessionId } = await loadFixture(openSessionFixture);
      await expect(contract.connect(alice).castVote(sessionId, 3))
        .to.be.revertedWithCustomError(contract, "InvalidOption")
        .withArgs(sessionId, 3);
    });

    it("rejects a vote before the session is opened", async function () {
      const { contract, organizer, alice, sessionId } = await loadFixture(createdSessionFixture);
      await contract.connect(organizer).registerVoters(sessionId, [alice.address], [10]);
      await expect(contract.connect(alice).castVote(sessionId, 0))
        .to.be.revertedWithCustomError(contract, "InvalidState")
        .withArgs(sessionId, State.Open, State.Created);
    });

    it("rejects a vote in an opened session before its start time", async function () {
      const { contract, organizer, alice } = await loadFixture(deployFixture);
      const now = await time.latest();
      await contract.connect(organizer).createSession("Future", ["A", "B"], now + HOUR, now + 2 * HOUR, 0);
      await contract.connect(organizer).registerVoters(1, [alice.address], [10]);
      await contract.connect(organizer).openSession(1);
      await expect(contract.connect(alice).castVote(1, 0))
        .to.be.revertedWithCustomError(contract, "VotingNotStarted")
        .withArgs(1, now + HOUR);
      await time.increaseTo(now + HOUR);
      await expect(contract.connect(alice).castVote(1, 0)).to.emit(contract, "VoteCast");
    });

    it("rejects a vote after the voting window has expired", async function () {
      const { contract, alice, sessionId, end } = await loadFixture(openSessionFixture);
      await time.increaseTo(end);
      await expect(contract.connect(alice).castVote(sessionId, 0))
        .to.be.revertedWithCustomError(contract, "VotingEnded")
        .withArgs(sessionId, end);
    });

    it("rejects a vote after the session is closed", async function () {
      const { contract, organizer, alice, bob, sessionId, end } = await loadFixture(openSessionFixture);
      await time.increaseTo(end);
      await contract.connect(organizer).closeSession(sessionId);
      await expect(contract.connect(bob).castVote(sessionId, 0))
        .to.be.revertedWithCustomError(contract, "InvalidState")
        .withArgs(sessionId, State.Open, State.Closed);
      await expect(contract.connect(alice).castVote(sessionId, 0)).to.be.revertedWithCustomError(contract, "InvalidState");
    });
  });

  describe("closing and results", function () {
    it("calculates weighted results from accepted votes only", async function () {
      const { contract, organizer, alice, bob, carol, sessionId } = await loadFixture(openSessionFixture);
      await contract.connect(alice).castVote(sessionId, 1); // 600 -> Reject
      await contract.connect(bob).castVote(sessionId, 0); // 300 -> Approve
      await contract.connect(carol).castVote(sessionId, 0); // 100 -> Approve
      await expect(contract.connect(organizer).closeSession(sessionId))
        .to.emit(contract, "SessionClosed")
        .withArgs(sessionId, organizer.address, 3, 1000);

      const r = await contract.getResults(sessionId);
      expect(r.optionWeights).to.deep.equal([400n, 600n, 0n]);
      expect(r.optionVotes).to.deep.equal([2n, 1n, 0n]);
      expect(r.totalVotedWeight).to.equal(1000n);
      expect(r.totalEligibleWeight).to.equal(1000n);
      expect(r.quorumReached).to.equal(true);
      // Head-count majority (Approve, 2 votes) differs from weighted majority (Reject).
    });

    it("reports quorum not reached when participating weight is below the threshold", async function () {
      const { contract, organizer, bob, sessionId, end } = await loadFixture(openSessionFixture);
      await contract.connect(bob).castVote(sessionId, 0); // 300 of 1000 = 30% < 50%
      await time.increaseTo(end);
      await contract.connect(organizer).closeSession(sessionId);
      const r = await contract.getResults(sessionId);
      expect(r.totalVotedWeight).to.equal(300n);
      expect(r.quorumReached).to.equal(false);
    });

    it("does not expose results before closure", async function () {
      const { contract, alice, sessionId } = await loadFixture(openSessionFixture);
      await contract.connect(alice).castVote(sessionId, 0);
      await expect(contract.getResults(sessionId))
        .to.be.revertedWithCustomError(contract, "InvalidState")
        .withArgs(sessionId, State.Closed, State.Open);
    });

    it("prevents closing early while registered voters have not yet voted", async function () {
      const { contract, organizer, alice, sessionId, end } = await loadFixture(openSessionFixture);
      await contract.connect(alice).castVote(sessionId, 0);
      await expect(contract.connect(organizer).closeSession(sessionId))
        .to.be.revertedWithCustomError(contract, "CloseNotAllowedYet")
        .withArgs(sessionId, end);
    });

    it("rejects unauthorized attempts to close a session", async function () {
      const { contract, alice, otherOrganizer, sessionId, end } = await loadFixture(openSessionFixture);
      await time.increaseTo(end);
      for (const caller of [alice, otherOrganizer]) {
        await expect(contract.connect(caller).closeSession(sessionId))
          .to.be.revertedWithCustomError(contract, "NotSessionOrganizer")
          .withArgs(sessionId, caller.address);
      }
    });

    it("allows the admin to close after the end time (liveness) and forbids re-closing", async function () {
      const { contract, admin, organizer, sessionId, end } = await loadFixture(openSessionFixture);
      await time.increaseTo(end);
      await expect(contract.connect(admin).closeSession(sessionId)).to.emit(contract, "SessionClosed");
      await expect(contract.connect(organizer).closeSession(sessionId)).to.be.revertedWithCustomError(contract, "InvalidState");
    });

    it("cannot close a session that was never opened", async function () {
      const { contract, organizer, sessionId } = await loadFixture(createdSessionFixture);
      await expect(contract.connect(organizer).closeSession(sessionId))
        .to.be.revertedWithCustomError(contract, "InvalidState")
        .withArgs(sessionId, State.Open, State.Created);
    });
  });
});
