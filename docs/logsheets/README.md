# The plant's paper log sheets

`Manna-Reclaim-Log-Sheets.docx` — seven landscape A4 pages, each one a complete
sheet that fits on a single side:

| Page | Sheet | Machines |
|---|---|---|
| 1 | Special line | PR2, R1, R3, R4 (and PR1 / R2 when turned onto the special line) |
| 2 | Coarse line | PR1, Refiner 2 |
| 3 | Grinding line | Grinder 1, Grinder 2, Soorya Grinder |
| 4 | Cracker | CRK, plus the picking gang |
| 5 | Autoclaves | Autoclave A, Autoclave M — one row per charge |
| 6 | Boiler | *not mirrored from the app — see below* |
| 7 | How to fill these in | one page for the notice board |

Print one page, or the pack. Each page is its own Word section, so printing just
the grinding line does not drag the boiler's sheet along with it.

## Adding the logo

The sheets currently carry a placeholder box where the logo goes. Two ways to
fix it, whichever suits:

**In Word** — click the box on page 1, delete it, paste the logo in. Repeat on
each page, or copy the whole header table once it looks right.

**Re-generate** — drop the logo in this folder as `manna-group.png` and run:

```
python build_logsheets.py
```

It is picked up automatically and sized to the header. Any other path works too:

```
python build_logsheets.py --logo "C:\path\to\manna-group.png"
```

## Why there is a script

The columns are not invented. Every one of them is a field the app actually
stores — see `server/src/validations/run.validation.js` for the vocabulary and
the per-kind sheets in `client/src/pages/user/MachinesPage.tsx` for which fields
belong to which machine. If paper and tablet ask for different things, the shift
gets entered twice from two sources that disagree, and the disagreement is
discovered a month later by somebody reconciling a figure.

So when a field is added to the app, add it here and regenerate. `python
build_logsheets.py` prints how much of each page every sheet uses and refuses to
pretend a sheet fits when it does not:

```
Height used per sheet:
  special       18.6 cm of 19.2
  coarse        19.1 cm of 19.2
  ...
```

Column widths are scaled to the printable width automatically, so a new column
cannot silently push the remarks off the right-hand edge.

## The boiler sheet is a draft

There is no boiler anywhere in MANNA RECLAIM. Nothing about it is recorded, so
page 6 is not a mirror of anything — it is what a firewood-fired boiler
attendant's log ordinarily carries: hourly pressure, water level, feed pump,
firewood added, blowdown, and a short start-and-end-of-shift check list.

Correct it to match how the boiler is actually attended. Once it is right it can
be built into the app the same way the machines are, and then this page becomes
a mirror like the rest.

## Requirements

Python 3 and `python-docx`:

```
pip install python-docx
```
