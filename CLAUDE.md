# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Python CLI tool that generates an Excel workbook (`plan_proizvodnje_modularno.xlsx`) for waterjet cutting production scheduling. The workbook contains two sheets:
- **NALOZI** — work order entry with automatic scheduling formulas (start/end datetime calculation, overlap detection, deadline tracking)
- **GANT** — visual Gantt chart driven by conditional formatting formulas linked to NALOZI data

## Running

```bash
python -m plan_proizvodnje        # generates plan_proizvodnje_modularno.xlsx
python plan-proizvodnje.py        # legacy wrapper, same result
```

## Dependencies

- `openpyxl` — sole external dependency (no requirements.txt; install manually: `pip install openpyxl`)

## Architecture

```
plan_proizvodnje/
├── __init__.py    # create_workbook() — entry point, creates Workbook with both sheets
├── __main__.py    # CLI entry: python -m plan_proizvodnje
├── config.py      # All constants: colors, column headers, row limits, machine list
├── styles.py      # openpyxl style helpers (solid_fill, full_border, center_cell, apply_style_range)
├── formulas.py    # Excel formula builders for NALOZI sheet (helper, datetime, display columns)
├── nalozi.py      # NALOZI sheet builder (headers, validations, body styling, conditional formatting)
└── gant.py        # GANT sheet builder (date headers, machine rows, visual logic with conditional formatting)
```

### Key Design Decisions

- All Excel formulas are generated as strings in Python, not computed in Python — the workbook is formula-driven so users can modify data in Excel and see live recalculations
- Helper columns O-V in NALOZI are hidden computation columns (`_START_DT`, `_END_DT`, etc.) that feed visible columns I-N
- GANT uses array-style `SUMPRODUCT`/`INDEX-MATCH` formulas referencing NALOZI data — changes to NALOZI column layout will break GANT formulas
- Machines are hardcoded in `config.MACHINES`: `["Arpel", "Classica", "CNC nož"]`
- Grid dimensions: `MAX_ROWS=300` data rows, `DAYS_IN_GANT=183` (~6 months), 8h workday (07:00-15:00)

### Cross-Sheet Dependencies

GANT formulas reference NALOZI columns by absolute letter (e.g., `NALOZI!$E$5:$E$304`, `NALOZI!$O$5:$O$304`). If NALOZI column order changes, update both `formulas.py` and `gant.py`.

## Supabase

- Project ID: `pgrgbfsltlcqzootkuaa`
- Koristiti MCP Supabase alate s ovim project ID-em

## Language

All user-facing labels, comments, and variable names in Croatian. Code comments and docstrings also in Croatian.
