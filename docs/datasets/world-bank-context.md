# World Bank country-level context exercise

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Status:** Day 1, separate exercise. Not part of the ingestion pipeline.

> This exercise uses published country-level indicators from the World Bank's public
> API. It is a separate activity on purpose. It is never joined to the
> institution-level synthetic submissions.

---

## 1. Why this is a separate exercise

The synthetic submissions and the World Bank indicators are observations of different
things at different grains.

| | Institution submissions | World Bank indicators |
| --- | --- | --- |
| One row means | One institution's position on one date | One country's indicator value in one year |
| Identified by | `institution_id` and `reporting_period` | Country code, indicator code and year |
| Produced by | A supervised institution, for the supervisor | A national statistic, published for everyone |
| Who uses it | Sector supervision and institution-level exceptions | Context: is this country's financial sector developing? |
| Frequency | Monthly, per institution | Annual, per country |

A country-level indicator says something about a country. An institution submission
says something about one institution. Joining them would create a row that claims
"this is what happened at this institution", and the World Bank value would be
repeated for every institution in that country, diluting the country figure by the
number of institutions and misrepresenting the institutional figure entirely.

The correct way to use them together is as **separate layers of the same chart**: a
country indicator on one axis, an institution's position relative to the sector on
another, with an explicit note that they are not the same measure. Or as narrative
context in a briefing. Never as a join key.

**The discipline matters because it is the easiest mistake to make in a SupTech
project.** Regulatory reporting and public statistics look like the same kind of
data. They are not, and a system that treats them as interchangeable produces
numbers that look right and mean nothing.

---

## 2. The API

| Resource | URL |
| --- | --- |
| API root | `https://api.worldbank.org/v2/` |
| Documentation | https://datahelpdesk.worldbank.org/knowledgebase/articles/889392 |
| Financial Development data collection | https://data.worldbank.org/collections/findata |

### The call

```text
https://api.worldbank.org/v2/country/{country_code}/indicator/{indicator_code}?format=json&per_page={n}
```

For Tanzania and account ownership at a financial institution or with a mobile
money service provider:

```text
https://api.worldbank.org/v2/country/TZA/indicator/FX.OWN.TOTL.ZS?format=json&per_page=20
```

The response has two elements:

- `response[0]` is the metadata: the page number, the total number of pages, the
  total number of records, the source identifier and the date the source was last
  updated.
- `response[1]` is the array of observations. Each one carries the indicator code
  and value, the country code and name, the date, the unit and the country metadata
  object.

Two things to read every time before teaching an indicator:

- **The indicator name and definition**, which comes back inside each observation
  under `indicator.value`. The code alone does not tell you what it measures.
- **The metadata block**, which carries the number of pages and the last updated
  date. It tells you whether you are looking at a complete series or the first
  page of one.

### Finding indicator codes

The API can list the indicators available for a country:

```text
https://api.worldbank.org/v2/indicator?format=json&per_page=20000
```

Financial-sector indicators to look for include account ownership (`FX.OWN.TOTL.ZS`),
domestic credit to the private sector (`FS.AST.PRVT.GD.ZS`), the depth of the
financial intermediary, and the number of depositors per 1,000 adults. Confirm the
definition, the unit, the coverage and the update frequency from the source metadata
before teaching any of them.

---

## 3. The exercise in the notebook

`day-01-data-engineering/notebooks/world_bank_context.ipynb` runs the retrieval
end to end. It does five things:

1. Fetches a country-level indicator for Tanzania and prints the metadata block.
2. Shows the grain of the result: one row per year, with gaps where the source has
   no observation.
3. Fetches a second indicator and shows what a multi-indicator frame looks like.
4. Prints the observation grain of the institution-level submissions side by side
   with the country-level grain, to make the difference concrete.
5. Fetches the same indicator for a set of comparison countries, which is the shape
   a later cross-country view would take.

The notebook does not join the two datasets, and it says why on the cell that could
have done it.

### Notes for the trainer

- **The API is a live external service.** If the room has no internet access, the
  notebook will fail at the retrieval step. Check this before the session and have
  a saved copy of one response ready. The notebook prints the metadata block
  precisely so a participant can see that it read a real published response.
- **Gaps are normal.** Several indicators have missing years. A missing observation
  is not a zero, and the notebook shows a gap rather than filling it.
- **The values are real.** This is the one part of the programme that uses published
  figures rather than synthetic records. Keep that distinction explicit.
- **The last updated date moves.** The metadata block carries it. Do not quote a
  figure without its date.

---

## 4. What the exercise is for

By the end of it, the participant should be able to answer:

1. What does one row of a country-level indicator represent?
2. Why can it not be joined to an institution-level submission?
3. What is the correct way to use it alongside supervisory data?
4. Where do the gaps in a published series come from, and why is a gap not a zero?

That fourth question is the same question as "why is a missing deposit not a zero",
and it is worth asking in both places.
