export function uiChecks({ frame, prefix, wait, until, check }) {
  return {
    "Garage comparison, equip and ordinary-input test": async () => {
      const win = frame.contentWindow,
        doc = win.document;
      await until(() => doc.querySelector("#loading")?.hidden);
      doc.querySelector("#home").click();
      await until(() => doc.querySelector("#stage").className === "view-start");
      doc.querySelector("#workshop-button").click();
      await until(() => doc.querySelector("#work-garage"));
      doc.querySelector("#work-garage").click();
      await until(
        () => doc.querySelector("#stage").className === "view-garage",
      );
      const content = await (await fetch(prefix + "content.json")).json();
      const tires = content.parts.filter((p) => p.slot === "tires");
      const rows = [];
      for (const part of tires) {
        const select = doc.querySelector('[data-slot="tires"]');
        select.value = part.id;
        select.dispatchEvent(new win.Event("change", { bubbles: true }));
        const text = doc.querySelector("#part-slots").textContent;
        check(
          text.includes(part.description),
          "Visible part description differs from canonical definition",
        );
        check(
          doc
            .querySelector("#garage-stats")
            .textContent.includes(part.asphalt.toFixed(2)),
          "Visible asphalt grip differs from measured specification",
        );
        rows.push({
          id: part.id,
          description: part.description,
          asphalt: part.asphalt,
          gravel: part.gravel,
          mud: part.mud,
        });
      }
      const alternate = tires.find((p) => p.id === "rally");
      const equip = doc.querySelector('[data-slot="tires"]');
      equip.value = alternate.id;
      equip.dispatchEvent(new win.Event("change", { bubbles: true }));
      const selected = doc.querySelector('[data-slot="tires"]').value;
      doc.querySelector("#garage-back").click();
      await until(
        () => doc.querySelector("#stage").className === "view-workshop",
      );
      doc.querySelector("#work-garage").click();
      check(
        doc.querySelector('[data-slot="tires"]').value === selected,
        "Equipped test build was lost",
      );
      doc.querySelector("#garage-test").click();
      await until(() => doc.querySelector("#stage").className === "view-race");
      await until(
        () =>
          doc.querySelector("#countdown").textContent === "" &&
          doc.querySelector("#hud-time").textContent !== "00:00.000",
      );
      win.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          code: "ArrowUp",
          key: "ArrowUp",
          bubbles: true,
        }),
      );
      await wait(1000);
      win.dispatchEvent(
        new win.KeyboardEvent("keyup", {
          code: "ArrowUp",
          key: "ArrowUp",
          bubbles: true,
        }),
      );
      const speed = +doc.querySelector("#hud-speed").textContent;
      check(speed > 0, "Ordinary input did not drive equipped build");
      doc.querySelector("#pause-button").click();
      [...doc.querySelectorAll("#modal-actions button")]
        .find((b) => b.textContent === "Return to editor")
        .click();
      await until(
        () => doc.querySelector("#stage").className === "view-garage",
      );
      check(
        doc.querySelector('[data-slot="tires"]').value === selected,
        "Test return lost selected part",
      );
      doc.querySelector("#garage-back").click();
      await until(
        () => doc.querySelector("#stage").className === "view-workshop",
      );
      doc.querySelector("#home").click();
      return {
        rows,
        selected,
        speedKmh: speed,
        compared: true,
        equipped: true,
        driven: true,
        returnPreserved: true,
        scope:
          "Workshop test garage; all parts are legitimately available. Bench handling measurements are a separate receipt.",
      };
    },
    "Browser invitation success, cancellation and fallbacks": async () => {
      const { resultInvitation, shareInvitation } = await import(
        prefix + "sharing.js"
      );
      const doc = frame.contentDocument;
      await until(() => doc.querySelector("#loading")?.hidden);
      const state = doc.querySelector("#stage").className;
      const result = Object.freeze({
        id: "review-share",
        trackName: "Yard Loop",
        mode: "daily",
        laps: 3,
        elapsedMs: 123456,
        classification: [{ id: "player" }],
      });
      const invitation = resultInvitation(result, {
        date: "2026-10-16",
        slug: "yard-loop",
      });
      let sent,
        copied,
        manual,
        callbackCount = 0;
      const success = await shareInvitation(invitation, {
        navigator: {
          share: async (payload) => {
            sent = payload;
          },
        },
      });
      const cancelled = await shareInvitation(invitation, {
        navigator: {
          share: async () => {
            throw new DOMException("User cancelled", "AbortError");
          },
          clipboard: {
            writeText: async () => {
              callbackCount++;
            },
          },
        },
        manual: () => {
          callbackCount++;
        },
      });
      check(
        cancelled === "cancelled" && callbackCount === 0,
        "Cancel fell through to another transfer",
      );
      const clipboard = await shareInvitation(invitation, {
        navigator: {
          share: async () => {
            throw new DOMException("Denied", "NotAllowedError");
          },
          clipboard: {
            writeText: async (text) => {
              copied = text;
            },
          },
        },
      });
      const fallback = await shareInvitation(invitation, {
        navigator: {
          clipboard: {
            writeText: async () => {
              throw new DOMException("Denied", "NotAllowedError");
            },
          },
        },
        manual: (text) => {
          manual = text;
        },
      });
      check(
        success === "shared" &&
          sent.text === invitation.text &&
          sent.url === invitation.url,
        "Share payload lost text or link",
      );
      check(
        clipboard === "copied" && copied === invitation.complete,
        "Clipboard payload incomplete",
      );
      check(
        fallback === "manual" && manual === invitation.complete,
        "Manual fallback incomplete",
      );
      check(
        doc.querySelector("#stage").className === state &&
          result.elapsedMs === 123456,
        "Sharing changed result or UI state",
      );
      return {
        success,
        cancelled,
        clipboard,
        fallback,
        date: invitation.date,
        url: invitation.url,
        cancellationSideEffects: callbackCount,
        statePreserved: true,
        scope:
          "Production share function executed by a browser fixture with injected navigator APIs; no OS share sheet or external message sent.",
      };
    },
    "Injected gamepad, large text and touch interruption": async () => {
      const win = frame.contentWindow,
        doc = win.document;
      await until(() => doc.querySelector("#loading")?.hidden);
      doc.querySelector("#home").click();
      const descriptor = Object.getOwnPropertyDescriptor(
          win.navigator,
          "getGamepads",
        ),
        pad = {
          axes: [0, 0],
          buttons: Array.from({ length: 17 }, () => ({
            pressed: false,
            value: 0,
          })),
        };
      Object.defineProperty(win.navigator, "getGamepads", {
        configurable: true,
        value: () => [pad],
      });
      const press = async (i) => {
        pad.buttons[i] = { pressed: true, value: 1 };
        await wait(100);
        pad.buttons[i] = { pressed: false, value: 0 };
        await wait(250);
      };
      try {
        doc.querySelector("#settings-button").focus();
        await press(0);
        check(
          doc.querySelector("#modal-title").textContent === "SETTINGS",
          "Gamepad A did not activate focused menu control",
        );
        const slider = doc.querySelector('[data-range="sensitivity"]'),
          before = +slider.value;
        slider.focus();
        await press(15);
        check(+slider.value > before, "D-pad did not change range");
        slider.value = before;
        slider.dispatchEvent(new win.Event("input", { bubbles: true }));
        slider.dispatchEvent(new win.Event("change", { bubbles: true }));
        const touch = doc.querySelector('[data-setting="touch"]');
        if (!touch.checked) touch.click();
        const large = doc.querySelector('[data-setting="largeHud"]');
        if (!large.checked) large.click();
        const originalFont = win.getComputedStyle(doc.body).fontSize;
        doc.body.style.fontSize = parseFloat(originalFont) * 2 + "px";
        await wait(100);
        check(
          parseFloat(win.getComputedStyle(doc.body).fontSize) >=
            parseFloat(originalFont) * 2,
          "Text did not double",
        );
        check(
          doc.querySelector("#modal").scrollWidth <=
            doc.querySelector("#modal").clientWidth + 1,
          "Large-text settings overflow horizontally",
        );
        doc.body.style.fontSize = "";
        await press(1);
        check(
          !doc.querySelector("#modal").open,
          "Gamepad B did not close menu",
        );
        doc.querySelector("#lesson-button").click();
        await until(
          () => doc.querySelector("#stage").className === "view-race",
        );
        await until(
          () =>
            doc.querySelector("#countdown").textContent === "" &&
            doc.querySelector("#hud-time").textContent !== "00:00.000",
        );
        pad.buttons[7] = { pressed: true, value: 1 };
        await wait(700);
        pad.buttons[7] = { pressed: false, value: 0 };
        check(
          +doc.querySelector("#hud-speed").textContent > 0,
          "Trigger did not accelerate",
        );
        await press(9);
        check(doc.querySelector("#modal").open, "Start did not pause");
        const time = doc.querySelector("#hud-time").textContent;
        await wait(200);
        check(
          doc.querySelector("#hud-time").textContent === time,
          "Paused gamepad race advanced",
        );
        await press(9);
        await wait(850);
        check(
          !doc.querySelector("#modal").open &&
            doc.activeElement === doc.querySelector("#world"),
          "Start did not resume with driving focus",
        );
        win.dispatchEvent(new win.Event("gamepaddisconnected"));
        await until(() => doc.querySelector("#modal").open);
        [...doc.querySelectorAll("#modal-actions button")]
          .find((b) => b.textContent === "Resume")
          .click();
        await wait(850);
        const steering = doc.querySelector("#steering-pad");
        steering.dataset.pointer = "17";
        steering.dispatchEvent(
          new win.PointerEvent("pointercancel", {
            pointerId: 17,
            pointerType: "touch",
            bubbles: true,
          }),
        );
        check(
          doc.querySelector("#modal").open,
          "Interrupted touch did not pause",
        );
        return {
          emulatedGamepad: true,
          rangeAdjustment: true,
          startPauseResume: true,
          disconnect: true,
          touchCancellation: true,
          textScale: "200% computed body font, settings dialog",
          scope:
            "Injected browser input; no physical controller or device claim",
        };
      } finally {
        doc.body.style.fontSize = "";
        if (descriptor)
          Object.defineProperty(win.navigator, "getGamepads", descriptor);
        else delete win.navigator.getGamepads;
        frame.src = "/";
      }
    },
    "All official circuits through Workshop UI": async () => {
      const doc = frame.contentDocument;
      await until(() => doc.querySelector("#loading")?.hidden);
      const [
        { parseTrack, duplicateTrack, gameplay, stable },
        { compile },
        content,
      ] = await Promise.all([
        import(prefix + "model.js"),
        import(prefix + "track.js"),
        fetch(prefix + "content.json").then((r) => r.json()),
      ]);
      const normalize = (t) => {
        let n = 0;
        return stable(gameplay(duplicateTrack(t, () => String(n++))));
      };
      doc.querySelector("#workshop-button").click();
      await until(() => doc.querySelector("#track-name"));
      const rows = [];
      for (let i = 0; i < 12; i++) {
        doc.querySelector("#work-file").click();
        await until(() => doc.querySelector('[data-template="' + i + '"]'));
        const oldName = doc.querySelector("#track-name").value;
        doc.querySelector('[data-template="' + i + '"]').click();
        await until(
          () =>
            !doc.querySelector("#modal").open &&
            doc.querySelector("#track-name").value ===
              content.tracks[i].track.name + " — copy",
        );
        const x = doc.querySelector('[data-field="x"]');
        check(x, "Missing numeric inspector");
        const before = x.value;
        x.value = String(+before + 1);
        doc.querySelector("#apply-object").click();
        doc.querySelector("#work-undo").click();
        doc.querySelector("#source-preview").click();
        await until(() =>
          doc.querySelector('textarea[aria-label="Canonical track HTML"]'),
        );
        const track = parseTrack(
          doc.querySelector('textarea[aria-label="Canonical track HTML"]')
            .value,
        );
        check(compile(track).valid, "Invalid UI round trip: " + track.name);
        check(
          normalize(track) === normalize(content.tracks[i].track),
          "Gameplay changed in UI round trip: " + track.name,
        );
        rows.push({
          slug: content.tracks[i].track.slug,
          uiCopy: true,
          numericEditUndo: true,
          canonicalRoundTrip: true,
        });
        doc.querySelector("#modal-actions button").click();
      }
      doc.querySelector("#home").click();
      return {
        rows,
        scope:
          "Current official copies opened, edited, undone and serialized through actual UI. Original official authoring was CLI; that history is not rewritten.",
      };
    },
    "Native route client and local include fallback": async () => {
      const rows = [];
      for (const path of [
        "/track/yard-loop",
        "/editor/yard-loop",
        "/track/unknown-fixture",
        "/editor/",
        "/track/%3Cscript%3E",
      ]) {
        frame.src = path;
        await until(
          () =>
            frame.contentWindow.location.pathname === path &&
            frame.contentDocument.querySelector("#loading")?.hidden,
        );
        const doc = frame.contentDocument;
        check(
          !doc.body.textContent.includes("could not open"),
          "Native client did not boot",
        );
        rows.push({
          path,
          stage: doc.querySelector("#stage").className,
          dialog: doc.querySelector("#modal-title").textContent,
          sourceTrack:
            doc.querySelector("#routed-track")?.dataset.trackId || null,
        });
        check(
          path === "/editor/yard-loop"
            ? doc.querySelector("#stage").className === "view-workshop"
            : doc.querySelector("#modal").open,
          "Native route offered no usable action",
        );
        if (path === "/editor/yard-loop")
          await until(() =>
            doc
              .querySelector("#draft-status")
              .textContent.startsWith("Draft saved"),
          );
      }
      frame.src = "/";
      return {
        rows,
        scope:
          "Local native-include emulation with production wrapper and client modules; actual provider primitive evidence is recorded separately.",
      };
    },
  };
}
