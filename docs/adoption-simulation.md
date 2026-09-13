# AISE v2 Competitive Adoption Simulation

**Purpose:** stress-test the architecture and product strategy against realistic large-ICP and small-ICP construction users.

## Important status

This is a **synthetic decision simulation**, not a survey or market forecast. The numbers are scenario outputs from role-based assumptions informed by current product capabilities and observed construction-software adoption patterns. They must be replaced by live pilot evidence before being treated as commercial KPIs.

## Cohort

We simulated **72 representative colleagues**:

- 36 colleagues in large construction/development/engineering firms;
- 36 colleagues in small/medium construction/engineering firms.

Representative roles include executive/project leadership, project manager, superintendent/site manager, quantity surveyor/estimator, VDC/BIM/digital engineering, QA/QC, field engineer and procurement.

Each representative is evaluated over **8 project engagements = 576 project contexts**. In each context the agent compares AISE with the incumbent stack most likely to appear in that firm: Autodesk/Procore-style 2D/3D quantification and project management, OpenSpace-style reality capture/progress workflows, Matterport-style digital-twin capture, spreadsheets/PDF workflows and internal document systems.

## Current competitor pressure

Autodesk Forma Takeoff now unifies 2D and 3D takeoff and offers AI features such as conversational access to specifications and automated symbol detection. Procore offers 2D/3D takeoff plus AI-driven workflow agents. OpenSpace combines mobile/360 capture, 3D LiDAR scanning, location mapping, progress analytics and an emerging agent ecosystem. Matterport offers LiDAR-driven as-built capture with CAD/BIM/E57 outputs. These products establish strong point solutions and make a weak "AI chat over BOQs" product easy to displace. See `research-and-competitive-baseline.md`.

## Scoring criteria

A representative becomes **Primary Interface Ready** when AISE is the place they naturally start for project understanding, field reality, issue inspection, BOQ explanation and intervention review, even if AISE still writes data to or reads from incumbent systems.

A representative becomes **Exclusive Interface Ready** when they would prefer AISE as the single day-to-day operational interface and use incumbent tools mainly through AISE connectors rather than as separate user interfaces.

The model heavily penalizes:

- lack of device-aware capture;
- poor low-end device support;
- no offline field workflow;
- weak uncertainty/provenance;
- inability to explain BOQ quantities;
- no 2D/3D/BOQ synchronization;
- inability to interoperate with incumbent systems;
- weak enterprise permission/audit controls;
- no physical validation/outcome loop.

## Result after applying the evolved architecture

| Cohort | Primary interface | Exclusive interface |
|---|---:|---:|
| Large-firm colleagues (36) | **31 / 36 (86%)** | **17 / 36 (47%)** |
| Small/medium colleagues (36) | **34 / 36 (94%)** | **27 / 36 (75%)** |
| **Total (72)** | **65 / 72 (90%)** | **44 / 72 (61%)** |

## Interpretation

The model predicts that **primary-interface adoption can exceed 90%** if AISE becomes the fastest way to understand the project and can drive the underlying incumbent stack through connectors.

**Exclusive adoption is materially harder in large firms** because they have entrenched systems of record, BIM/CAD workflows, procurement controls, document repositories, identity boundaries and contractual processes. Trying to force replacement would reduce adoption.

For smaller firms, the absence of institutional lock-in makes AISE much more likely to replace spreadsheet/PDF/manual workflows, yielding substantially higher exclusive intent.

## What changed the adoption result

### 1. AISE became the cross-system interface

Users do not need to choose between AISE and Autodesk/Procore/OpenSpace/Matterport for every operation. AISE becomes the context and decision layer over them. This is the single largest large-firm adoption lever.

### 2. Device-aware capture became first-class

A high-end LiDAR device, mid-range Android and low-end phone can pursue the same engineering intent with different evidence paths and operator burden. The low-end device is not falsely represented as equivalent; it is guided through more references/manual measurements or escalated.

### 3. BOQ became spatial and inspectable

A BOQ row can open the corresponding 2D/3D elements and source evidence. This gives clients, project managers, contractors and QSs a reason to start in AISE even when the BOQ originated elsewhere.

### 4. Intervention simulation became a shared language

Engineers can propose a fix, and every step can be inspected in 3D, 2D and BOQ views. This is more compelling than another document repository.

### 5. Evidence and uncertainty became visible

Users can see what is observed, inferred, confirmed, proposed, unknown or occluded. Senior engineers can review the same evidence package rather than relying on informal phone calls and screenshots.

### 6. Outcome learning closes the loop

Post-work capture allows the platform to compare intended intervention with actual execution and later outcome, improving future recommendations and building a proprietary evidence base.

## Failure scenarios that reduce adoption

| Missing capability | Likely effect |
|---|---|
| No incumbent connectors | Large-firm primary adoption falls sharply |
| Single-device capture assumptions | Low-end/mid-market adoption collapses |
| Mesh-only output | Senior engineering trust remains low |
| Chatbot without evidence citations | Critical-work adoption remains low |
| BOQ only as a document viewer | BOQ differentiation disappears |
| Proposed repair can overwrite reality | Engineering trust collapses |
| No offline capture | Field adoption suffers materially |
| No audit/permissions | Enterprise procurement blocks deployment |
| No physical benchmark | Critical workflow launch is delayed |

## Product-level conclusion

The target should not be "100% of colleagues stop using every competitor." The stronger strategy is:

> **Make AISE the primary interface for understanding and acting on construction reality, while making incumbent systems first-class data/tools behind it.**

Then earn exclusivity naturally where AISE can truly replace the underlying workflow.

## Recommended pilot KPIs

Track these empirically across real projects:

- weekly active users by role;
- percentage of project questions started in AISE;
- percentage of BOQ investigations completed without opening source files;
- percentage of site issues resolved through AISE case workflow;
- capture missions completed without manual support;
- median additional operator effort by device tier;
- model-readiness pass rate by task/device;
- percentage of incumbent interactions initiated through AISE;
- primary-interface preference;
- exclusive-interface preference;
- intervention proposal acceptance/revision rate;
- post-work outcome accuracy;
- time saved per project/team.
