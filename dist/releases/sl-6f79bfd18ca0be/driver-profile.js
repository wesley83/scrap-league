// A remembered public nickname is a local preference, never an account identity.
export function driverAlias(value) {
  const name = typeof value === "string" ? value.normalize("NFC").trim() : "";
  if (!name || [...name].length > 24 || /[\u0000-\u001f\u007f]/.test(name))
    throw Error(
      "Enter a driver name with 1–24 characters and no control characters.",
    );
  return name;
}

export function nameField(document, value = "Driver") {
  const form = document.createElement("form");
  form.className = "driver-profile";
  form.noValidate = true;
  const label = document.createElement("label"),
    input = document.createElement("input"),
    status = document.createElement("p");
  label.textContent = "Public driver name";
  input.name = "nickname";
  input.autocomplete = "nickname";
  input.dir = "auto";
  input.value = value;
  input.maxLength = 48; // Validation counts Unicode code points, not UTF-16 units.
  input.required = true;
  input.spellcheck = false;
  status.id = "driver-name-status";
  status.setAttribute("role", "status");
  input.setAttribute("aria-describedby", status.id);
  status.textContent =
    "1–24 characters. Saved on this device; public only when you submit a time.";
  label.append(input);
  form.append(label, status);
  const read = () => {
    try {
      const alias = driverAlias(input.value);
      input.removeAttribute("aria-invalid");
      return alias;
    } catch (error) {
      input.setAttribute("aria-invalid", "true");
      status.textContent = error.message;
      input.focus();
      throw error;
    }
  };
  form.onsubmit = (event) => event.preventDefault();
  return { form, input, status, read };
}

export async function rememberDriver(settings, store, alias) {
  const normalized = driverAlias(alias);
  if (!store)
    throw Error("Device storage is unavailable. Your name has not been saved.");
  await store.set("settings", { ...settings, driverAlias: normalized });
  settings.driverAlias = normalized;
  return normalized;
}
