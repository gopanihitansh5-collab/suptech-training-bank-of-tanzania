# SupTech for market conduct supervision

**Citations.** "p.n" = the `=== PAGE n ===` markers of the extracted source text of the World Bank note (Source list). The note's printed pages run six lower (source p.7 = printed p.1).

## Purpose and scope

Domain reference for the programme. Primary source: the World Bank note *From Spreadsheets to Suptech* (June 2018), which defines Suptech and documents case studies of the U.S. CFPB, the Bank of Lithuania (BoL) and the Central Bank of Brazil (BCB) (p.7, Section 1).

Scope: the note covers **market conduct supervision** — "aspects of financial sector supervision other than prudential supervision, such as consumer protection, anti-money laundering/combating the financing of terrorism (AML/CFT) and competition-related business conduct issues" (p.7). It says nothing about Bank of Tanzania systems; this prototype uses synthetic data only. Treat it as transferable practice, not a description of this repository.

## What market conduct supervision means for a supervisor

The problem: market conduct supervision is "critical to ensuring that financial consumers are protected from unfair business practices and provided with clear and relevant information" (p.7). Three features make it technology-dependent:

- **Disparate, largely unstructured data.** Supervision "requires the collection of a wide range of data from disparate sources" (p.7); the note's example of unstructured data is "a customer's description of his or her complaint against an FSP" (p.9 fn.4), and authorities also struggle to use disclosure materials and annual reports (p.9). Sources span complaints, ombudsmen, and media and social media (p.9).
- **Qualitative, judgement-based rules.** Supervisors must judge whether a practice is "fair"; "the relationship between such judgment and data-driven analysis is not always straightforward" (p.10).
- **Thin capacity.** Mandates span banks, cooperatives, microfinance institutions, e-money issuers and P2P lenders, often understaffed (p.7).

Market conduct has a tool set distinct from prudential: monitoring treatment of individual customers, assessing complaints-handling effectiveness, identifying anticompetitive practices, monitoring suspicious transactions (p.9). The data supports **detect** (spikes and trends in indicators, p.11; early warning from real-time complaint data, p.14), **investigate** (findings driving inspection or sanction decisions, p.18), **intervene** (revisiting the examination schedule after a spike, p.15) and **report** (monthly, annual and semiannual complaints reporting, p.15).

## SupTech generations

The four-generation framing comes from the secondary source, not the World Bank note. Per Regnology, citing the BIS FSI paper: generations 1-2 offer only limited automation with data in disjoint silos; generations 3-4 feature end-to-end automation and consolidation into a single "data lake". Regnology's preconditions: distributed, cloud-native, containerised/microservice architecture; big-data storage replacing monolithic relational storage; API-driven exchange replacing GUI interaction and proprietary A2A (Regnology).

The note's own examples sit in the earlier generations: BoL's complaints system is a single relational database (Oracle, SharePoint) with scanned submissions uploaded by hand (p.17, p.18); Austria's platform standardises uploads into departmental "smart cubes" (p.10); Rwanda's warehouse automates pulls into a warehouse, not a lake (p.10); the CFPB migrated its CRM to integrate with wider IT (p.13, p.16); Brazil's SisCom remains bespoke (p.19, p.21).

For a small central bank the note is explicit: "Suptech use cases and outcomes are possible regardless of the size or maturity of the jurisdiction" (p.21) and "many countries lack the resources available to the CFPB, but this does not preclude development of a basic yet robust system in a smaller country" (p.16). State plainly that **this prototype is not a fourth-generation platform**: it is file-based ingestion and validation over synthetic CSV with a Pandas pipeline — gen 1-2 discipline (immutable source, structured outputs, documented decisions) plus Regnology's API-driven handoff, with no data lake, no distributed compute and no machine-learning runtime.

## SupTech vs RegTech

Division of labour (p.8): Regtech is technology applied "from the perspective of FSPs" to meet compliance requirements efficiently; Suptech is applied "from the perspective of supervisory authorities" to facilitate supervisory processes. Basel: Suptech "is not focused on assisting with compliance with laws and regulations, but on supporting supervisory agencies in their assessment of that compliance" (BCBS 2017, 35, quoted p.8).

Regulatory reporting is the bridge: automated data-collection tools "can represent the intersection of Regtech and Suptech, as both the FSPs and the supervisory authorities are using the same technology" (p.11). The same artefact serves both sides — Austria's banks upload standardised data the central bank turns into "smart cubes" (p.10), and machine readable and executable regulation codes the rule so the entity pulls the information itself and a simulated rule change executes automatically (p.11, Box 2.2). Cautions: no definitions of either term are universally agreed (p.8), and MRER risks include "incorrect interpretation, errors in the code base, lack of flexibility, and opportunities for abuse" (p.11).

## Core technologies in the SupTech stack

| Technology | One-line definition | Supervisory use | Note support |
|---|---|---|---|
| Process automation | Manual, rules-based steps executed in software | Pull raw data from FSP systems; merge returns, ombudsman and credit-bureau data | p.9 |
| Machine-to-machine APIs | Standard machine exchange, no GUI re-keying | Automated collection, public dissemination, inter-regulator sharing, executable rules | p.10-11, p.14, p.16 |
| NLP / text analytics | Extracting structure from free text | Clean marketing materials, consumer agreements, complaint narratives | p.11; fn.5, p.9 |
| Anomaly / spike detection | Flagging departures from expected volume | Spikes and trends in market conduct indicators | p.11, p.14 |
| Real-time data availability | Publishing data continuously, not periodically | Early warning, dynamic exam schedules; daily automated pulls | p.14-15, p.10 |
| Data management and storage | Storing growing volumes safely and efficiently | Cloud computing for "big data": on-demand shared pool of resources | p.12 |
| Platform and database integration | One platform over siloed sources | Collection and validation between FSP and supervisor; examiner access; merging "noisy" sets | p.11-12 (Fig. 1) |
| Data governance and quality | Rules and validation so data can be relied on | Standardised submissions yielding "more consistent and higher-quality data" | p.10, p.19 |
| Dashboards and alerting | Role-specific views with automated flags | Internal online dashboard for examiners; early-warning reports, company profiles | p.14-15 |

Network analytics and web scraping for a sentiment index are **not** in the note: it names media and social media sources as inputs (p.9) and social media posts as a sentiment input (p.11) but describes no scraping method. Its only chat facility is SisCom's inspector-to-FSP "chat box" (p.19), not a consumer chatbot. Data lakes come from Regnology.

## Market conduct use cases

1. **Complaint analysis through a CRM (CFPB).** Forms give structured data, the consumer narrative is unstructured; 81 percent of 2017 complaints arrived via the online platform and most (97 percent) received an FSP response within 15 days (p.13).
2. **Complaint-database automation (CFPB).** The Consumer Complaint Database publishes real-time structured and unstructured data, downloadable as CSV or JSON, filterable by product and exportable via the Open Data API (p.14); examiners reach it on site through an internal dashboard (p.15).
3. **Spikes-and-trends detection and risk scoring (CFPB).** The tool flags short-, medium- and long-term changes in complaint volumes across daily, weekly and quarterly windows, working around company size, random variation, growth and seasonality (p.14). A spike can change the examination schedule or trigger action, and in one case the bureau reached a company before the company was aware (p.15); complaints are scaled for size and ranked by severity, so high-severity concentration proxies for higher risk in the field-and-market-intelligence score (p.15).
4. **Electronic complaints and disputes system (BoL).** Introduced in 2016 to replace post, e-mail and in-person submissions handled by an "onerous manual process", it takes online applications with an electronic signature, auto-matches them to the FSP's record and stores documents, decisions and progress in one database; non-online submissions are scanned and manually uploaded (p.17). For market-side assessment BoL "relies almost entirely on statistics from the electronic database", disregarding institution size (p.18). Built in-house on Oracle and SharePoint over 10 months, it has informed a thematic product review (p.17, p.18).
5. **Automated data collection from institutions (Austria, Rwanda).** Austria's data-input platform interfaces directly with bank IT systems; standardised uploads become "smart cubes" per supervisory department, giving more consistent and higher-quality data and removing duplicate reports (p.10, Box 2.1). Rwanda's data-pull warehouse pulls raw data from FSP systems into reports, including daily automated pulls, reducing manual reporting while generating privacy, operational and reputational risk (p.10, Box 2.1).
6. **Machine readable and executable regulation (FCA, Bank of England).** At a November 2017 TechSprint, participants coded a subset of FCA handbook reporting rules into machine-executable language that pulled information directly from the supervised entity and simulated a rule change executed automatically by it (p.11, Box 2.2).
7. **Remote supervision workflow (Central Bank of Brazil).** SisCom collects data and documents via a web portal and interacts online with hard-to-reach FSPs, enabling remote supervision; data is mostly qualitative (governance, systems, AML/CFT controls) via supervisor-designed questionnaires (p.19). It auto-generates letters, information requests and final supervision reports, supports four risk-based inspection tiers and rates control elements and inherent risk 1-4 (p.19, p.20); migration to the Automated Supervision Process began in early 2018 (p.21).
8. **Sentiment analysis and AI/ML detection of conduct issues.** Sentiment analysis is a general capability for unstructured sources such as social media posts, customer reviews and consumer complaints, alongside NLP cleaning of marketing materials and consumer agreements (p.11); media and social media sources are named inputs a consumer-protection supervisor may analyse (p.9). AI is used broadly (covering machine learning and NLP) to automate hypothesis discovery — finding recurring friction points between providers and customers from complaint data, and analysing suspicious transactions (p.9) — "while maintaining control over supervisory judgments that are ultimately made" (p.10). No sentiment-index product is described.

## Data pipeline implications for Day 1

The bridge to the ingestion pipeline (ingest synthetic CSV, check schema and types, identify duplicates, apply validation rules, emit valid / rejected / duplicate outputs plus a validation summary):

- **Keep the raw source immutable.** The note's premise is that the supervisor, not the FSP, aggregates: data-pull and data-input both deliver raw data to the supervisor for transformation (p.9-10). A rejected record cannot be re-derived if the source was overwritten.
- **Validate every record and record why it failed.** The outcome chain depends on "improved scope, accuracy, consistency, and timeliness of collected information" (p.12), and standardised submission produced more consistent, higher-quality data in Austria (p.10). BCB's SisCom "does not analyze or validate all data submitted by banks and NBFIs automatically"; part is validated by supervisors using other systems (p.19). The rejection-reason column makes that supervisory step explicit rather than silent.
- **Do not mix country-level and institution-level grains.** The CFPB framework separates product-market inputs (market size, market risk) from institution product-line inputs (institution product size, field and market intelligence) (p.14). BoL's market-side assessment "does not necessarily take into account the size or systemic importance of FSPs" and works from complaints against particular products (p.18). Same discipline for the World Bank country indicators: join only under an explicit, defensible model.
- **Where the API-driven handoff fits.** Regnology's third principle is API-driven exchange replacing GUI re-keying and proprietary A2A; the note's counterparts are executable rules, the CFPB Open Data API and API-based inter-regulator sharing (p.11, p.14, p.16). The dashboard handoff is where the validated, single-grain dataset becomes a supervisor-facing view, following the CFPB pattern of examiners drawing dynamic information from an internal dashboard (p.15).

## Limitations, risks and disclosure

From Section 4 (Cross-cutting Considerations) and the case studies:

- **Technology is a tool, not a supervisory approach.** "The parameters of the Suptech solution should not be the key determinant of the supervisory approach" (p.22); Sup and Tech must form a feedback loop (p.12). There is no consensus on market conduct indicators, and the OECD risk-dashboard initiative was still in progress (p.22).
- **Data quality is the binding constraint.** Standardised formats and centralised transformation deliver consistency and quality, while automated collection creates privacy, operational and reputational risk (p.10); even a mature platform does not validate everything automatically (p.19).
- **Model risk, over-reliance and human review.** Professional judgment is critical to validate and, where necessary, modify risk ratings; thresholds are themselves judgment calls; supervisors need capacity to define the question, choose the measurement approach, generate data and assess model accuracy (p.22). AI is useful only "while maintaining control over supervisory judgments" (p.10).
- **Capacity and readiness.** Supervisors need workflow definition, pilot testing, training and a technology strategy (p.22); FSPs need lead time, training and controls for accurate reports (p.23). BCB needed six staff and over two years, and faced low FSP technological capacity (p.21). BoL's caveat: only 25 percent of complaints were submitted online at the time of writing (p.18) — adoption, not code, is the constraint.
- **Privacy, security and liability.** Data protection law must permit access while protecting data; secure access protocols and controls against external and internal misuse are required; expanded access creates operational, reputational and liability risk, because real-time access may be seen as increasing the supervisor's responsibility for misconduct predictable from the data (p.23).
- **State plainly:** the prototype uses synthetic data only. It is not a regulatory reporting standard, and nothing in it maps to real Bank of Tanzania internal systems or submissions.

## Source list

1. **From Spreadsheets to Suptech: Technology Solutions for Market Conduct Supervision.** World Bank discussion note, document number 127577-REVISED. Finance, Competitiveness & Innovation Global Practice, International Bank for Reconstruction and Development / The World Bank, Washington DC, June 2018. Document date 2018/06/01; disclosure date 2018/06/25. Landing page: https://documents.worldbank.org/en/publication/documents-reports/documentdetail/612021529953613035
2. **The technical foundations of SupTech.** Regnology (Regnology Group GmbH), Insight. https://www.regnology.net/en/resources/insights/the-technical-foundations-of-suptech/ — accessed 2026-11-16.
