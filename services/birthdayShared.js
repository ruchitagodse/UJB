export function getFormattedDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

export function parseDobInput(dob) {
  if (!dob) return null;

  try {
    let day, month, year;

    if (typeof dob === "string" && dob.includes("/")) {
      [day, month, year] = dob.split("/");
    } else if (typeof dob === "string" && dob.includes("-")) {
      // Handle YYYY-MM-DD or DD-MM-YYYY
      const parts = dob.split("-");
      if (parts[0].length === 4) {
        [year, month, day] = parts;
      } else {
        [day, month, year] = parts;
      }
    } else {
      const d = new Date(dob);
      if (!Number.isNaN(d.getTime())) return d;
      return null;
    }

    // Normalize year
    let fullYear = parseInt(year);
    if (fullYear < 100) {
      fullYear += 1900; // Birthdays are usually in the 1900s or 2000s, but mostly 1900s for older records
      if (fullYear < 1920) fullYear += 100; // Heuristic: if < 1920, assume 2000s (e.g. 15 -> 2015)
    }

    const isoDate = `${fullYear}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const finalDate = new Date(isoDate);
    
    return Number.isNaN(finalDate.getTime()) ? null : finalDate;
  } catch {
    return null;
  }
}

export function getBirthdayDobInfo(dob) {
  const birthDate = parseDobInput(dob);

  if (!birthDate || Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  const nextBirthday = new Date(
    today.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate()
  );

  if (nextBirthday < today) {
    nextBirthday.setFullYear(today.getFullYear() + 1);
  }

  return {
    age: nextBirthday.getFullYear() - birthDate.getFullYear(),
    day: nextBirthday.toLocaleDateString("en-US", {
      weekday: "long",
    }),
  };
}

export function getDateLabel(offset) {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  if (offset === -2) return "Day Before Yesterday";

  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}
