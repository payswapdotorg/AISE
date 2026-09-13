# AISE v2 Research and Competitive Baseline

## Core product evidence

AISE's earlier architecture already separated evidence, uncertainty, task-specific accuracy and device-specific sensing. The evolved design preserves those principles and adds adaptive evidence acquisition and construction-domain intelligence.

### Device-aware scanning

Apple RoomPlan currently demonstrates guided room capture using camera/LiDAR, producing parametric room data and supporting merging of multiple room scans into a structure. Google ARCore Depth uses camera motion plus depth sensors where present; Google documents that depth quality varies by distance and improves as the user moves through the environment. These platform facts justify a capability-aware planner rather than a single fixed capture recipe.

Sources:
- Apple RoomPlan: https://developer.apple.com/documentation/roomplan
- Apple multi-room scanning: https://developer.apple.com/documentation/roomplan/scanning-the-rooms-of-a-single-structure
- Google ARCore Depth: https://developers.google.com/ar/reference/java/com/google/ar/core/Frame

## Competitive baseline

### Autodesk Forma

Autodesk Forma Takeoff combines 2D and 3D quantities, classifications, formulas, cloud document management and conceptual estimating. Autodesk also describes AI-powered conversational specification access and automated symbol detection. AISE therefore cannot win by simply adding AI explanations to takeoff: the differentiation must be the link between BOQ, observed reality, evidence, device-aware capture and intervention states.

Sources:
- https://construction.autodesk.com/tools/construction-takeoff-software/
- https://construction.autodesk.com/workflows/artificial-intelligence-construction/

### Procore

Procore offers 2D/3D takeoff and AI-driven construction workflows. In 2026 it announced an AI experience with digital coworkers that operate across drawings, specifications, photos and project workflows. AISE must therefore be more than a chatbot and must connect physical reality, cost scope and evidence with auditable claims.

Sources:
- https://www.procore.com/fc/takeoff
- https://www.procore.com/press/new-procore-ai-experience-embeds-datagrid-into-procore

### OpenSpace

OpenSpace has moved beyond 360 capture into phone capture, LiDAR 3D scanning, plan location, progress tracking and an emerging agent ecosystem. Its 2026 materials explicitly position visual intelligence as context for AI agents and describe thousands of projects and 1,000+ data-center projects using its platform. AISE therefore needs a stronger semantic/engineering model and deeper device-aware evidence loop rather than competing as a generic visual documentation tool.

Sources:
- https://www.openspace.ai/products/capture/
- https://www.openspace.ai/press-releases/openspace-unveils-the-next-generation-of-its-visual-intelligence-platform-at-waypoint-2026/
- https://www.openspace.ai/press-releases/openspace-surpasses-1000-data-center-projects-defining-the-construction-intelligence-standard-for-ai-infrastructure/

### Matterport

Matterport offers LiDAR-driven AEC as-built workflows and multiple outputs such as CAD, BIM and E57, and markets browser-accessible digital twins. AISE therefore needs to differentiate on engineering evidence, task-specific assurance, adaptive capture and intervention reasoning rather than generic digital-twin viewing.

Source:
- https://go.matterport.com/architecture-engineering-construction.html

## Strategic implication

The competitive moat is not an LLM wrapper. It is the combination of:

```text
Device capability graph
+ adaptive evidence acquisition
+ structured Reality Graph
+ BOQ semantic graph
+ evidence/provenance
+ task-specific assurance
+ synchronized 2D/3D/BOQ intervention states
+ execution/outcome history
+ incumbent connectors
```

## Product positioning

Best initial positioning:

> **AISE is the operating interface for understanding and acting on construction reality.**

Not a takeoff replacement. Not merely a scanner. Not merely an AI assistant. It is the evidence-linked layer that connects what was designed, what was priced, what was built, what is wrong, what is proposed and what actually happened.
