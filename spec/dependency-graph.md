# AISE v2 Dependency Graph and Three-Worker Waves

## Hard DAG

```text
001 + 002 → 003
003 → 004,005
003+005 → 006
003+004 → 007
004 → 008
006+007 → 009
004+007 → 010
004+003 → 011
010 → 012 → 013
011 → 014
012+013 → 015
013+015 → 016
014+016 → 017
008+016 → 018
012+013+016 → 019
013+016 → 020
016+020 → 021
007+008+016 → 022
016+022 → 023
017+021 → 024
016+008+023 → 025
025+023 → 026
021+026 → 027
017+026+027 → 028
008+022+023+025 → 029
006+009 → 030
025+026+029 → 031
016+019+020 → 032
016+019 → 033
013+015+016+019 → 034
019+030+031 → 035
023+024+029 → 036
016+017+020+021 → 037
024+027+029+037 → 038
031+032+033+034+035+036+037+038 → 039
```

## Three-worker waves

The wave numbers are the **earliest safe batches** under the hard DAG. Some waves contain fewer than three because a canonical model dependency intentionally serializes the critical path.

| Wave | Work Items |
|---:|---|
| 0 | 001, 002 |
| 1 | 003 |
| 2 | 004, 005 |
| 3 | 006, 007, 008 |
| 4 | 009, 010, 011 |
| 5 | 012, 014, 030 |
| 6 | 013 |
| 7 | 015 |
| 8 | 016 |
| 9 | 017, 018, 019 |
| 10 | 020, 022, 033 |
| 11 | 021, 023, 032 |
| 12 | 024, 025, 034 |
| 13 | 026, 029, 037 |
| 14 | 027, 031, 036 |
| 15 | 028, 035, 038 |
| 16 | 039 |

## Why the serial waves exist

The Reality Graph, geometry semantics and intervention state model are authority-sensitive joins. They deliberately serialize some work instead of creating unsafe parallel schema/migration conflicts. Where possible, independent domain/UI/benchmark work is placed in groups of three.

## Tech Lead rule

Dispatch exactly the currently eligible subset, not the entire nominal wave. Recompute after every accepted merge. If a shared contract or migration conflict appears, reduce concurrency rather than widen surfaces.
