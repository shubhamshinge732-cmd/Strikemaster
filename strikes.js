
// ⚡ Strike Map - Using short user-friendly commands
const strikeReasons = {
  mw: { strikes: 0.5, reason: "Missed war (both attacks)" },
  fwa: { strikes: 1, reason: "Missed FWA war search" },
  realbaseafterbl: { strikes: 1, reason: "Real base after BL war" },
  mwt: { strikes: 2, reason: "Missed wars twice in a row" },
  nfp: { strikes: 2, reason: "Not following war plan" },
  cg: { strikes: 2, reason: "Failure to reach 1000 Clan Games Points" },
  mr: { strikes: 2, reason: "Missed raid attacks" },
  rb: { strikes: 2, reason: "Broke clan rules" },
  rbf: { strikes: 3, reason: "Real war base in FWA war" },
  mwth: { strikes: 4, reason: "Missed wars 3 times in a row/4 in season" },
  don: { strikes: 4, reason: "Failure to meet 5000 donations + received in a season" },
  ld: { strikes: 4, reason: "Left the Discord server" },
  ia: { strikes: 4, reason: "Inactivity (multiple days)" },
};

module.exports = {
  strikeReasons
};
