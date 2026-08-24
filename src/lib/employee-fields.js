export function getMissingEmployeeFields(profile, t) {
  const required = [
    ["phone", t("manager.tbl.phone")],
    ["email", t("manager.tbl.email")],
    ["ccq_number", "CCQ#"],
    ["ccq_expiration_date", t("employees.ccqExpirationDate")],
    ["birth_date", t("employees.birthDate")],
    ["apprentice_level", t("employees.level")],
    ["km_rate", t("employees.kmRate")],
    ["nas_employee", t("employees.nasEmployee")],
    ["work_region", t("employees.workRegion")],
    ["union_association", t("employees.unionAssociation")],
    ["wage_schedule", t("employees.wageSchedule")],
    ["hourly_rate", t("employees.hourlyRate")],
  ];

  return required
    .filter(([field]) => profile[field] == null || String(profile[field]).trim() === "")
    .map(([, label]) => label);
}
