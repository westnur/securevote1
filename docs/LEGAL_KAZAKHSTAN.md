# Legal Questions for a Hypothetical SecureVote Business in Kazakhstan

> **General information for an educational project — not legal advice.** The questions below identify topics a qualified Kazakhstan lawyer would need to review. Laws are amended frequently; always read the **current consolidated text** on the official legal information system **Adilet** (`adilet.zan.kz`, operated by the Institute of Legislation and Legal Information under the Ministry of Justice). Links were checked on 21 October 2026; article-level wording was **not** verified by the project team.
>
> Using a blockchain does **not** by itself make a corporate decision legally valid. Validity depends on corporate law, the company's charter and the prescribed meeting/voting procedures.

## 1. Primary legal sources (official texts)

| Topic                                                                                  | Act                                                                                                  | Official source                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corporate voting in joint-stock companies (general meetings, absentee voting, ballots) | Law of the RK "On Joint Stock Companies" No. 415-II of 13 May 2003                                   | [adilet.zan.kz/rus/docs/Z030000415_](https://adilet.zan.kz/rus/docs/Z030000415_/z030415.htm)                                                                                                    |
| Personal data                                                                          | Law of the RK "On Personal Data and Their Protection" No. 94-V of 21 May 2013                        | [adilet.zan.kz/rus/docs/Z1300000094](https://adilet.zan.kz/rus/docs/Z1300000094/z13094.htm)                                                                                                     |
| Digital assets                                                                         | Law of the RK "On Digital Assets in the Republic of Kazakhstan" No. 193-VII of 6 February 2023       | [adilet.zan.kz/rus/docs/Z2300000193](https://adilet.zan.kz/rus/docs/Z2300000193)                                                                                                                |
| Electronic documents and e-signatures                                                  | Law of the RK "On Electronic Document and Electronic Digital Signature" No. 370-II of 7 January 2003 | adilet.zan.kz/rus/docs/Z030000370_ (identifier confirmed via [WIPO Lex](https://www.wipo.int/wipolex/en/legislation/details/16138), which reproduces the Adilet text)                           |
| Informatization (information systems, data security requirements)                      | Law of the RK "On Informatization" No. 418-V of 24 November 2015                                     | [adilet.zan.kz/rus/docs/Z1500000418](https://adilet.zan.kz/rus/docs/Z1500000418)                                                                                                                |
| Copyright in software                                                                  | Law of the RK "On Copyright and Related Rights" No. 6-I of 10 June 1996                              | [adilet.zan.kz/rus/docs/Z960000006_](https://adilet.zan.kz/rus/docs/Z960000006_)                                                                                                                |
| Legal form of the business (LLP)                                                       | Law of the RK "On Limited and Additional Liability Partnerships" No. 220-I of 22 April 1998          | [adilet.zan.kz/rus/docs/Z980000220_](https://adilet.zan.kz/rus/docs/Z980000220_)                                                                                                                |
| Taxation (corporate income tax used in the financial model)                            | Tax Code of the RK No. 214-VIII of 18 July 2025 (in force from 1 January 2026)                       | adilet.zan.kz/rus/docs/K2500000214 (identifier per secondary sources; see also the [State Revenue Committee news](https://www.gov.kz/memleket/entities/kgd/press/news/details/1103583?lang=ru)) |
| Fintech regulatory sandbox (option)                                                    | AIFC Financial Technology Rules / AFSA FinTech Lab                                                   | [afsa.aifc.kz — FinTech Lab](https://afsa.aifc.kz/?p=656)                                                                                                                                       |

Homeowners' associations and non-profit organizations are governed by their own legislation (housing relations and non-commercial organizations); those acts would need to be identified and checked for each segment before offering the service to them.

## 2. Questions for legal review

### Corporate voting (Law on Joint Stock Companies, company charter)

1. Under which conditions may a JSC hold a general meeting by **absentee voting** or **mixed voting**, and which agenda items are excluded? (Secondary sources indicate the charter may prohibit absentee voting on some or all items and that ballots are sent to persons on the shareholder list.)
2. What **form and signature requirements** apply to a ballot (e.g. identification details of an individual shareholder, signature of a legal entity's head/representative)? Is a ballot signed with an **electronic digital signature (EDS)** acceptable, and does a wallet signature qualify? (Most likely **not** — a wallet key is not a qualified EDS.)
3. Who is legally responsible for **counting votes** (counting commission, registrar, central securities depository) and for the **minutes** of the meeting? Can a smart contract's tally be used as the official count or only as a supporting audit trail?
4. How must the **shareholder list** (record date) be produced, and can voting weights be imported from the registrar's official register?
5. Are **cumulative voting** (board elections) or **qualified majorities** required for certain decisions? The prototype implements only plurality by weight and a simple quorum.

### Personal data (Law No. 94-V)

6. Which data processed by SecureVote is personal data (names, e-mails, share counts, **wallet addresses linked to people**, votes)? What **legal basis/consent** is needed?
7. Do **data-localisation** requirements apply to the database and to blockchain nodes? Public-chain data is replicated worldwide and is **immutable** — how does that interact with rights to correct or delete data?
8. What security, breach-notification and cross-border transfer obligations apply?

### Digital assets (Law No. 193-VII)

9. Confirm that a voting contract **without tokens, payments or tradable assets** is outside the regulated digital-asset activities (no issuance, exchange or mining). The prototype deliberately has no token and no on-chain payments.
10. If a public blockchain with transaction fees were used, would paying fees in cryptocurrency create additional obligations?

### Electronic documents and informatization (Laws No. 370-II, No. 418-V)

11. Can a blockchain record be an **electronic document** with legal force, or is a separately signed protocol required?
12. Would a production system serving companies require certification or compliance with information-security standards?

### Intellectual property (Law No. 6-I, contracts)

13. Who owns the code written by students, contributors and with **AI assistance**? Are IP assignment agreements needed? (See [`AI_DISCLOSURE.md`](AI_DISCLOSURE.md) for tools used and open-source licences.)
14. Are the open-source licences (mostly MIT; see disclosure) compatible with commercial use? Are there trademark conflicts with the name "SecureVote"?

### Legal form of the hypothetical business

15. Is a **limited liability partnership (LLP / ТОО)** the appropriate form for a small software company, versus registering in the **AIFC** (common-law jurisdiction) to use the FinTech Lab sandbox?
16. What are the tax consequences (corporate income tax, VAT registration threshold, payroll taxes) of each option?

## 3. Position taken in this prototype

- The application is labelled as an **educational simulation** and is **not represented as legally compliant** or suitable for real corporate elections.
- Only fictional organizations and synthetic data are used; no real personal data is processed.
- No tokens, cryptocurrency or real funds are involved; the chain is a local Hardhat network.
- A real product would treat the blockchain record as an **additional audit trail** next to the legally required meeting protocol until legal review confirms otherwise.
