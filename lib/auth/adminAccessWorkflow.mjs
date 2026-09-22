export function findAuthorizedAdmin(adminDocs, email, hasAdminAccess) {
  const normalizedEmail = String(email || "").toLowerCase();

  if (!normalizedEmail) {
    return { ok: false, status: 401, message: "Missing admin email" };
  }

  const adminDoc = adminDocs.find((docSnap) => {
    const data = docSnap.data() || {};
    const candidateEmail = String(
      data.email || data.Email || data.adminEmail || data.AdminEmail || docSnap.id || ""
    )
      .trim()
      .toLowerCase();
    return candidateEmail === normalizedEmail;
  });

  if (!adminDoc) {
    return { ok: false, status: 403, message: "You are not an Admin" };
  }

  const adminData = adminDoc.data();
  const role =
    adminData.role || adminData.Role || adminData.userRole || adminData.UserRole || "Admin";

  if (!hasAdminAccess(role)) {
    return {
      ok: false,
      status: 403,
      message: "Admin role is not authorized",
    };
  }

  return { ok: true, adminData, role, adminDocId: adminDoc.id };
}

export function shouldBootstrapAdmin(adminDocs) {
  return !Array.isArray(adminDocs) || adminDocs.length === 0;
}

export function buildBootstrapAdminRecord(decoded) {
  return {
    email: decoded.email?.toLowerCase() || "",
    name: decoded.name || "",
    role: "Admin",
    designation: "Founding Admin",
    photo: decoded.picture || null,
    createdAt: new Date(),
    bootstrap: true,
  };
}

export function buildAdminSessionPayload(adminData, decoded) {
  return {
    email: decoded.email?.toLowerCase(),
    name: adminData.name || adminData.Name || decoded.name || "",
    role: adminData.role || adminData.Role || adminData.userRole || adminData.UserRole || "Admin",
    designation: adminData.designation || adminData.Designation || "",
    photo: adminData.photo || adminData.Photo || decoded.picture || null,
  };
}

export function validateAdminSessionAccess(decoded, hasAdminAccess) {
  if (!decoded) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (!hasAdminAccess(decoded.role)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return {
    ok: true,
    admin: {
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      designation: decoded.designation || "",
      photo: decoded.photo || null,
    },
  };
}

export function validateAdminRoleAccess(admin, hasRequiredAccess, message) {
  if (!admin || !hasRequiredAccess(admin.role)) {
    return {
      ok: false,
      status: 403,
      message: String(message || "Forbidden"),
    };
  }

  return { ok: true };
}
