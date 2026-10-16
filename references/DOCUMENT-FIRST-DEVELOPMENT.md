# Document-first, extensible development on Pagelove

**Scope:** All Pagelove projects, including games, publishing sites, dashboards, directories, editors and business tools.

**Written:** October 14, 2026.

This document defines a reusable architectural preference and explains its rationale, implementation, tradeoffs and exceptions. It is intended as practical project guidance and as source material for articles explaining document-first development and Pagelove's role in it.

## The rule

For every project built on Pagelove, prefer an architecture in which the application's durable content, meaningful entities and editable configuration are represented as structured, addressable documents.

Begin by identifying the information the application manages, the relationships between that information, and the operations people need to perform. Give that information a clear document structure before deciding how a JavaScript framework, rendering engine or interface component will represent it.

Use semantic HTML, structured properties, stable identifiers, URLs, reusable document fragments and explicit behavioral interfaces wherever they provide a suitable foundation. Use Pagelove's supported capabilities to store, compose, validate, authorize and update those documents. Add application code to perform computation, coordinate interactions and provide specialized presentation.

**The guiding principle is: make the application's meaningful information independently understandable, addressable and reusable; attach presentation and behavior through clear, replaceable interfaces.**

This preference applies to new projects and substantial extensions of existing projects. Apply it proportionately: small features should remain small, and existing applications should be migrated in useful increments.

## 1. Start with the subject matter of the application

The first design question should be: "What are the meaningful things in this application?"

For an event site, those things might be events, sessions, speakers and venues. For a project tracker, they might be projects, tasks, milestones and approvals. For a game, they might be worlds, formations, objects and abilities. For a directory, they might be organizations, locations, categories and listings.

Describe those entities using the language of the people who use the application. Identify their properties, relationships, lifecycle and ownership.

This creates an application model that can support several interfaces. A task remains a task whether it appears in a list, a calendar, a board, a report or an editor. The underlying meaning should survive a redesign of any one of those views.

Before implementation, establish:

- Which entities require durable storage.
- Which entities need their own URLs or fragment identifiers.
- Which properties are editable and by whom.
- Which relationships are references and which are ownership relationships.
- Which values are authoritative, derived or temporary.
- Which actions change the stored information.

For a small feature, this can be a short written explanation. For a substantial application, it should become a documented model.

## 2. Treat documents as application resources

A document can represent an article, a product, a workflow, an event, a configuration or a collection of records. Its role extends beyond the final page a visitor sees.

Prefer document boundaries that reflect meaningful ownership, editing and reuse. A document should be independently manageable when there is a practical reason to manage it independently.

For example, an event's information might live at:

```text
/events/autumn-workshop/definition.html
```

That information could support:

```text
/events/autumn-workshop
/editor/events/autumn-workshop
/calendar
/speakers/alex
```

Those addresses represent different uses of the same information. The architecture should make the relationship between them explicit.

Avoid creating a separate authoritative copy of an event's title, date and venue inside each view. Prefer one source with several compositions or derived representations.

A document may contain several related entities when they share a lifecycle and are commonly read or changed together. There is no requirement to create a separate file for every small object.

## 3. Make structure and meaning explicit

Use meaningful HTML elements and structured properties to describe the information.

When the content has ordinary document semantics, use those semantics directly: headings for headings, lists for collections, tables for genuinely tabular information, links for navigation and forms for user input.

Use microdata or other supported structured representations when the application needs explicit entity types, properties and relationships. Reuse established vocabularies when they accurately describe the domain. Define a documented application vocabulary when the domain needs concepts that existing vocabularies do not express well.

For example, an event can remain useful to a reader while exposing its properties to software:

```html
<article
  id="autumn-workshop"
  itemscope
  itemtype="https://schema.org/Event"
>
  <h2 itemprop="name">Autumn workshop</h2>

  <p itemprop="description">
    A practical session on building editable web applications.
  </p>

  <time
    itemprop="startDate"
    datetime="2026-11-12T15:00:00Z"
  >
    November 12, 2026, at 15:00 UTC
  </time>

  <p>
    Location:
    <span itemprop="location">Online</span>
  </p>
</article>
```

The heading, description, time and location are part of the document's meaning. A calendar, event card, editor or export process can interpret them.

Structured markup does not automatically implement behavior or enforce validation. The vocabulary, platform configuration and application code must establish what those properties mean operationally.

Use names and structures that another developer can understand without reconstructing the entire application.

## 4. Establish one authoritative source for each kind of information

Document-first development requires a clear answer to: "Which representation is authoritative?"

An application may legitimately have a source document, an in-memory model, an offline cache, a search index and a rendering representation. Each should have a defined purpose and a defined relationship to the source.

For every significant representation, document:

- Where its information originates.
- Whether it can be edited directly.
- How changes reach the authoritative source.
- How it is refreshed or regenerated.
- How stale or conflicting versions are recognized.

Generated JavaScript objects, JSON snapshots, indexes and binary assets are appropriate when they serve a practical purpose. Prefer generating them from an established source rather than maintaining equivalent information manually in several formats.

In a game, an HTML world definition can produce a compact runtime representation. In a directory, listing documents can produce a search index. In a reporting application, stored records can produce aggregated summaries.

The value comes from a traceable transformation: developers should be able to explain how the displayed or computed result relates to its source.

## 5. Give resources stable identities

Use stable URLs and identifiers for information that must be referenced, edited, linked, composed or discussed.

Prefer identifiers that remain valid when presentation changes. A record's identity should not depend on its position in a list, its display label, its current CSS class or a transient component instance.

Distinguish between:

- The identity of the underlying record.
- The address of a particular view.
- The identifier of an element within that view.
- The version of the information being displayed.

These distinctions become important when the same record appears in multiple places or when several people edit it.

Addressable information is easier to link to, inspect, reuse, automate and recover. It also creates a more useful foundation for future interfaces.

## 6. Use Pagelove's native composition and routing where they fit

Before implementing a custom routing or page-composition system, evaluate Pagelove's native mechanisms.

Pagelove's parameterized routes allow one stored template to serve multiple concrete addresses and expose captured parameters to composition. For example, a template at `/editor/:name` can use the requested name to select the relevant content. Route behavior has specific rules, including differences between whole-document reads and other request forms; implementations must follow the documented behavior of the deployed platform. [Parameterized routes reference](https://docs.pagelove.com/reference/composing-pages/Parameterized-Routes/)

Pagelove also provides selector-based fragment inclusion through `p:include`. This allows shared navigation, editor shells, content records and other fragments to be assembled from their source documents. An include is expected to identify one matching element, so resource paths and selectors must be sufficiently precise. [Includes reference](https://docs.pagelove.com/reference/composing-pages/Includes/)

Prefer a reusable composition when several pages share structure. Keep the content that varies independently from the structure that remains common.

Validate route parameters before using them to choose resources. Define appropriate missing-resource behavior. Test the actual deployed route, particularly when local development does not reproduce server composition.

Native capabilities should reduce application-specific infrastructure while preserving understandable behavior.

## 7. Preserve the connection between a composed view and its source

A composed page should have a clear relationship to the documents from which it was assembled.

Pagelove's inclusion model can retain the origin identity of included fragments. Supported selector mutations can therefore reach the originating resource. This is a significant architectural capability: a view can expose editable information while preserving where that information belongs. [Includes and document mutation](https://docs.pagelove.com/reference/composing-pages/Includes/)

When using this capability, document the complete mutation path. The current include documentation distinguishes authorization against the addressed composed page from shape validation and concurrency handling at the origin resource. Those boundaries must be understood and verified.

Do not assume that every rendered element has a writable origin, that every request form resolves a parameterized route, or that composition grants permission to edit.

The general rule is to preserve provenance: a developer should be able to identify where a piece of information came from and where an accepted change will be stored.

## 8. Separate meaning, presentation and behavior

Give each layer a clear responsibility.

| Layer | Primary responsibility |
| --- | --- |
| Structured documents | Describe durable entities, content, relationships and editable configuration. |
| Pagelove configuration | Define supported composition, storage operations, validation, authorization and server processing. |
| CSS | Present document elements and their meaningful states. |
| Application JavaScript | Coordinate interactions, handle events, perform computation and manage temporary state. |
| Specialized renderers | Provide interfaces such as 3D scenes, charts, maps, audio or other computational presentation. |

These responsibilities can cooperate closely while remaining understandable.

A meaningful type can influence presentation. For example, an overdue task might receive a visible status label, and a moving game object might receive a recognizable editor treatment. Styling should communicate an established property or state.

Avoid encoding important business meaning solely in a color, layout position or decorative class. Preserve that meaning in a form that code, accessibility tools, editors and alternative views can interpret.

## 9. Attach behavior through explicit interfaces

Prefer behavior that operates on well-defined entities and events.

Identify meaningful actions and transitions in the domain: a task is submitted for completion, an item is selected, an approval is requested, a reservation is confirmed or an object is struck.

Use named functions, small modules, registries or custom events to connect those actions to their implementations. Choose the simplest mechanism that makes responsibilities clear.

An event contract should explain:

- What causes the event.
- Whether it expresses a request or reports a completed fact.
- What information it carries.
- Whether it can be canceled.
- Whether it bubbles or crosses component boundaries.
- Whether its processing is synchronous or asynchronous.
- How failures and repeated delivery are handled.

A request to complete a task and confirmation that the task was saved are different events. Treating them distinctly prevents an interface from presenting an attempted change as a completed one.

Client-side events do not grant authority to change stored information. The persistence layer must still enforce the relevant rules.

## 10. Make extension a designed capability

Extensibility should come from documented properties and behavior contracts.

Where useful, allow an entity to combine compatible capabilities. A content item might be reviewable and schedulable. A task might be assignable and repeatable. A game object might be armored and moving.

For each capability, define its required properties, behavior, interactions with other capabilities and validation rules. A new type name alone does not create an implementation.

Start with constrained extension points. An editor may let people choose among supported effects, layouts, validation options or workflow steps. These choices can produce substantial variety while remaining understandable and testable.

More powerful extension mechanisms should have explicit execution and permission boundaries. Trusted code extensions and user-authored configuration should have clearly defined roles.

The practical goal is that adding a new supported variation requires a small, local change rather than modifications spread throughout unrelated parts of the application.

## 11. Treat editors as views over the application model

An editor should work with the same documented information model that the application consumes.

Its controls should help people create valid content, understand relationships, inspect state and recover from mistakes. Where appropriate, provide preview, undo, draft recovery and import/export.

An editor can have temporary state—such as a selected item, an unfinished field or an unsaved draft. Keep that state distinct from the published document.

Avoid creating an editor-only format that requires a second manually maintained interpretation of the application. When an internal editing representation is useful, provide a defined conversion to and from the authoritative format.

Successful document-first design makes editing a natural extension of the application's model. It should also make future editors possible: a visual editor, a bulk-editing tool and an automated client can operate on the same documented contract.

## 12. Enforce validity and authority at the persistence boundary

Readable documents still need enforceable rules.

Define which actors may perform which operations on which resources. Define permitted document structures, required properties, valid values and protected fields.

Use the relevant Pagelove authorization, schema, shape and request-processing mechanisms where supported. Prism Breaker provides a concrete implementation of these capabilities for shared records and owner-managed documents. [Implemented Pagelove capability mapping](https://github.com/wesley83/prism-breaker#pagelove-features-used)

Client validation should provide immediate, helpful feedback. Server-side enforcement must remain authoritative for shared data.

Imported content should pass through a deliberate validation process. Reconstruct or sanitize accepted structures where appropriate, and prevent ordinary content from introducing executable scripts, privileged configuration or unintended composition directives.

Treat templates, server methods, authorization rules and executable extensions as application code with corresponding review requirements.

### Use schemas to help enforce relational integrity

The document model includes relationships as well as individual records. Use schemas to express the rules those relationships must satisfy, then enforce those rules when information is stored or changed.

Define, where relevant:

- Which entity types a reference may point to, and whether the referenced entity must exist.
- How many related entities are allowed or required, and which identifiers or relationships must be unique.
- Which relationships imply ownership or a shared lifecycle.
- What happens to dependent records when a referenced entity is moved, replaced or deleted.

For example, a session might be required to reference exactly one existing event. Deleting that event should follow a declared policy: reject the deletion while sessions depend on it, require reassignment, or deliberately remove owned sessions together. A valid-looking event URL alone does not establish that this relationship is valid.

Schemas make these expectations explicit and give editors and automated clients a common contract. The enforcement mechanism still matters: validating one document's structure does not by itself prove that a reference resolves or that a related record has the required type. Identify which constraints the deployed platform supports and which require additional server-side validation or coordinated writes. Account for concurrent changes so that a reference cannot become invalid between a check and an accepted write.

Relational integrity belongs at the persistence boundary alongside structural validity and authorization. Apply the same rules to editor saves, imports, automated updates and migrations, and verify that invalid relationships are rejected with useful feedback.

## 13. Make edits deliberate and recoverable

Use operations that match the intended scope of a change.

When an operation updates one record or fragment, prefer a supported operation that targets that record or fragment. When replacing a complete document, account for concurrent edits.

Use conditional writes, version checks or equivalent mechanisms where available. A stale editor should receive a conflict it can explain, with a practical route to recovery.

Preserve the user's work when a save fails. Distinguish between:

- A local draft.
- A queued change.
- A change currently being submitted.
- A change confirmed by the server.
- A conflicting or rejected change.

For operations that may be retried, define how duplicate submissions are recognized or prevented.

A trustworthy editor makes these states understandable and provides a way forward.

## 14. Separate application releases from user-managed content

Application code and editable content often have different lifecycles.

Templates, scripts, styles and validation rules may be released together. User-authored documents may change continuously. Deployment procedures must identify which resources belong to each lifecycle.

An ordinary application deployment should preserve existing user-managed information. Initial seed data should have explicit creation rules. Schema changes should have a migration strategy.

For systems requiring stable content during a session—such as a ranked challenge, assessment, published report or approval process—use a defined version or snapshot.

State clearly when an edit becomes effective. A useful policy might be "immediately for new views," "after publication," or "at the start of the next session." The correct policy depends on the product.

Document-first architecture makes independently editable content possible; release design makes that capability dependable.

## 15. Support accessible and progressively enhanced experiences

Use native web semantics and controls wherever they provide a good experience.

Links, forms, buttons, headings and structured content supply useful browser behavior, keyboard interaction and accessibility foundations. JavaScript can enhance those foundations with richer editing, previews and specialized interactions.

For information-oriented pages, aim to deliver meaningful content before extensive client-side initialization.

For experiences that fundamentally require scripting or specialized rendering—such as a 3D game—provide clear loading, support and failure states. Keep surrounding instructions, navigation and controls accessible.

Structured data alone does not establish accessibility. Review the actual rendered experience, including labels, focus behavior, reading order, contrast and nonvisual interpretation.

## 16. Design for the performance characteristics of the application

Measure the cost of parsing, composing, querying, transferring and rendering documents.

Use suitable document sizes, bounded queries, pagination, caching, indexes and generated representations. Avoid unnecessary work inside frequent interactions or animation loops.

An application can load a document, validate it once and translate it into an efficient runtime structure. A 3D engine can use arrays and GPU buffers. A search interface can use an index. A large report can use precomputed aggregates.

The source remains understandable while the runtime representation serves the workload.

Set practical limits for extension mechanisms and document composition. Unbounded nesting, unrestricted queries and excessive per-object processing can make an otherwise clear architecture unreliable.

## 17. Make offline behavior and synchronization explicit

When offline use matters, distinguish cached published content, local drafts, pending changes and confirmed server state.

Define which operations work offline, which require a connection, and how reconnection affects the user's work. Use stable identifiers and suitable conflict handling for synchronization.

Generated offline snapshots are compatible with document-first development when their source and version are known.

Do not treat a successful local write as confirmation of a successful shared write. Show the appropriate state and preserve pending work across recoverable failures.

The application's documentation should explain its offline model in language a maintainer can use to diagnose real problems.

## 18. Prefer native platform capabilities after checking their suitability

Before introducing another service or application layer, examine whether Pagelove and browser standards can meet the requirement.

Evaluate capabilities such as document storage, selector operations, composition, routes, schemas, authorization, methods and request processing against the actual task.

Pagelove's method elements provide a documented mechanism for invoking schema-defined behavior during composition, including implementations in supported languages such as Sessel and JavaScript. Their execution context and output rules should guide how they are used. [Method elements reference](https://docs.pagelove.com/reference/composing-pages/Method-Elements/)

Choose platform features because they satisfy a requirement clearly and reliably. Record any relevant deployment limitations and verify important behavior on the intended host.

When another service or specialized system is justified, identify the specific requirement it fulfills and define how it connects to the document model.

A project's success should be judged by useful behavior, maintainability and reliability rather than by the number of platform features it exercises.

## 19. Allow justified exceptions

Document-first development is the architectural preference. Choose another representation when it better serves a demonstrated requirement.

Appropriate examples include:

- Binary assets, images, audio and video.
- Dense numerical arrays or geometry buffers.
- High-frequency simulation state.
- Large analytical datasets.
- External systems that already own authoritative records.
- Standard interchange formats required by an integration.
- Secrets and credentials that belong in protected storage.
- Small temporary values that have no useful document lifecycle.

For each significant exception, record the reason, the authoritative source and the relationship to the rest of the application.

A concise explanation is usually sufficient. Routine engineering decisions should remain straightforward.

## 20. Require evidence that the architecture works as intended

Review the application's contracts and boundaries.

Relevant verification includes whether documents parse correctly, invalid changes are rejected, references resolve, relationship constraints hold through updates and deletions, composition selects the intended content, permissions are enforced, conflicts preserve work and derived representations remain consistent with their sources.

Check the behavior that matters to the change. Use browser review for interaction and presentation, focused automated checks for important contracts, and deployed checks for platform behavior that local tools do not reproduce.

Maintain an audit trail appropriate to the project, including plans, meaningful changes, migrations, verification and known limits.

Documentation should distinguish between a capability the platform offers, a capability the project implements and a behavior that has been verified on the deployed host.

## 21. Explain the architecture in terms that support future learning

Each substantial Pagelove project should be able to answer the following questions clearly:

1. What are its principal documents and entities?
2. Which information is authoritative?
3. How are pages and views composed?
4. How are edits validated, authorized and stored?
5. How does behavior attach to the information model?
6. How can someone add a supported type or capability?
7. Which parts are generated, cached or temporary?
8. What limitations or exceptions shaped the design?

These explanations should use concrete examples from the project.

For a blog post, show the lifecycle of one entity: how it is represented, displayed, edited, validated, reused and extended. This makes the architecture tangible. Readers can see how the decisions affect both the developer's work and the user's experience.

Avoid claiming automatic improvements in performance, accessibility, security, portability or collaboration. Explain the mechanisms that support those outcomes and the additional work each outcome requires.

## 22. Understand why this preference matters

This approach gives application information a durable form that can outlast a particular interface.

It improves inspectability because developers can examine meaningful resources directly. It supports reuse because several views can consume the same source. It supports editing because the information model has an explicit structure. It supports extension because properties, capabilities and behavior have named contracts.

It can also reduce the amount of custom infrastructure needed when Pagelove already provides the required storage, composition and request-processing mechanisms.

These benefits become stronger when the documents are well designed, the ownership rules are explicit and the application's behavior remains modular. Poorly structured HTML can be as difficult to maintain as poorly structured JavaScript.

The architecture therefore depends on disciplined modeling, clear boundaries and practical verification.

## 23. Apply the preference incrementally

For an existing application, begin with a feature that benefits from independent editing or reuse.

Extract one meaningful entity or collection. Define its document format. Add a reliable reader and validation path. Establish its ownership and update rules. Connect the existing interface to it. Introduce reusable composition or events where they solve a concrete coupling problem.

Retain useful existing code and specialized engines. Move additional features only when doing so creates a clear benefit.

For a new application, establish the document model early enough that page structure, editors, persistence and behavior can grow around the same concepts.

## Standing instruction for future work

> Prefer document-first, extensible web development for every Pagelove project. Represent durable domain information as meaningful, addressable resources; establish explicit sources of truth; use supported Pagelove capabilities for composition, persistence and enforcement; and attach presentation and behavior through clear, reusable interfaces. Use efficient derived representations and specialized code where the workload requires them. Document significant exceptions, verify the important boundaries, and preserve the ability to understand, edit, reuse and extend the application's information independently of any one interface.
