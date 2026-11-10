/* eslint-disable @typescript-eslint/no-explicit-any */
// Generates realistic, fictional demo data relative to today's date.
import { DEFAULT_SETTINGS, DIVISIONS, divisionOf } from "../constants";
import { addDays, bdToday, currentYear } from "../utils";

type Row = Record<string, any>;

// Deterministic pseudo-random generator so the demo looks the same each reset.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Record ids are deterministic too: if the browser cannot save the demo (storage full),
// the next page load rebuilds exactly the same records and the signed-in user stays valid.
let idRng = rng(1971);
function uuid(): string {
  const hex = () => Math.floor(idRng() * 16).toString(16);
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => (c === "x" ? hex() : ((Math.floor(idRng() * 4) + 8).toString(16))));
}

export const DEMO_DOMAIN = (process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "5sigbn.local").toLowerCase();

export function buildSeed(): Record<string, Row[]> {
  idRng = rng(1971);
  const R = rng(2026);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(R() * a.length)];
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const chance = (p: number) => R() < p;
  const today = bdToday();
  const year = currentYear();
  const isoYearsAgo = (y: number) => addDays(today, -Math.round(y * 365.25) - int(0, 300));
  const now = new Date().toISOString();

  const companies: Row[] = [
    ["bhq", "BHQ Pl", "BHQ"], ["hq", "HQ Coy", "HQ"], ["rdo", "Radio Coy", "Radio"], ["op", "Op Coy", "Op"],
    ["rr", "RR & Line Coy", "RR & Line"], ["106-bsc", "106 BSC", "106"], ["113-bsc", "113 BSC", "113"], ["121-bsc", "121 BSC", "121"], ["205-absc", "205 ABSC", "205"], ["eme", "EME Sec", "EME"],
  ].map(([slug, name, short], i) => ({ id: uuid(), slug, name, short_name: short, display_order: i + 1, active: true, created_at: now }));
  const coy = Object.fromEntries(companies.map((c) => [c.slug, c.id]));

  const leaveTypes: Row[] = [
    ["PL", "Privilege Leave", 60], ["CL", "Casual Leave", 20], ["ML", "Maternity Leave", null], ["MEDL", "Medical Leave", null], ["LPR", "Leave Preparatory to Retirement", null],
  ].map(([code, name, quota], i) => ({ id: uuid(), code, name, annual_quota: quota, active: true, display_order: i + 1 }));
  const lt = Object.fromEntries(leaveTypes.map((l) => [l.code, l.id]));

  const trainingTypes: Row[] = [
    ["IPFT", "IPFT", 2, "Bi-Annual", ["1st Bi-Annual", "2nd Bi-Annual"], 5, false],
    ["RET", "RET / Annual Firing", 1, "Firing", ["Annual Firing"], 3, true],
    ["SM", "Speed March", 4, "March", ["Spd March 1", "Spd March 2", "Spd March 3", "Spd March 4"], 1, false],
    ["GT", "Group Training", 1, "Period", ["Group Training"], 1, false],
  ].map(([code, name, freq, label, names, att, marks], i) => ({ id: uuid(), code, name, frequency: freq, sequence_label: label, sequence_names: names, max_attempts: att, has_marks: marks, pass_mark: marks ? 13 : null, applies_to: code === "GT" ? ["JCO", "OR"] : ["Offr", "JCO", "OR"], active: true, display_order: i + 1, completion_only: code === "GT" || code === "SM" }));
  const tt = Object.fromEntries(trainingTypes.map((t) => [t.code, t.id]));

  const settings: Row[] = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value, updated_at: now }));

  // ------------------------------------------------------------ soldiers
  const first = ["Md Abdul", "Md Rafiqul", "Md Shafiqul", "Md Jahangir", "Md Mizanur", "Md Azizul", "Md Anwar", "Md Habibur", "Md Mostafizur", "Md Kamrul", "Md Saiful", "Md Monirul", "Md Rashedul", "Md Shahidul", "Md Nazrul", "Md Ariful", "Md Sohel", "Md Rubel", "Md Mamun", "Md Sumon", "Md Shahin", "Md Faruk", "Md Tanvir", "Md Sabbir", "Md Imran", "Md Selim", "Md Liton", "Md Ripon", "Md Shakil", "Md Nayeem", "Md Hanif", "Md Delwar", "Md Kawsar", "Md Ashraf", "Md Jahid", "Md Nasir", "Md Masud", "Md Rakibul", "Md Asaduzzaman", "Md Mehedi"];
  const last = ["Hossain", "Rahman", "Islam", "Ahmed", "Uddin", "Miah", "Sarker", "Mollah", "Sheikh", "Khan", "Alam", "Haque", "Kabir", "Talukder", "Bhuiyan", "Akand", "Mondal", "Pramanik", "Hasan", "Karim"];
  const hindu = ["Sujon Kumar Das", "Pradip Chandra Roy", "Uttam Kumar Sarker", "Shyamal Chandra Barman", "Bishwajit Ghosh", "Liton Chandra Pal"];
  const districtsWeighted = [...DIVISIONS.Rajshahi, ...DIVISIONS.Rajshahi, ...DIVISIONS.Rangpur, ...DIVISIONS.Rangpur, ...Object.values(DIVISIONS).flat()];
  const trades = DEFAULT_SETTINGS.trades;
  const upazilas = ["Sadar", "Shibganj", "Sherpur", "Dhunat", "Gabtali", "Kahaloo", "Nandigram", "Sonatola", "Adamdighi", "Pirganj", "Mithapukur", "Badarganj", "Ullapara", "Shahjadpur", "Raiganj"];

  const BN_NAME: Record<string, string> = {
    Md: "মোঃ", Mst: "মোসাঃ", Abdul: "আব্দুল", Rafiqul: "রফিকুল", Shafiqul: "শফিকুল", Jahangir: "জাহাঙ্গীর", Mizanur: "মিজানুর", Azizul: "আজিজুল", Anwar: "আনোয়ার",
    Habibur: "হাবিবুর", Mostafizur: "মোস্তাফিজুর", Kamrul: "কামরুল", Saiful: "সাইফুল", Monirul: "মনিরুল", Rashedul: "রাশেদুল", Shahidul: "শহিদুল", Nazrul: "নজরুল",
    Ariful: "আরিফুল", Sohel: "সোহেল", Rubel: "রুবেল", Mamun: "মামুন", Sumon: "সুমন", Shahin: "শাহিন", Faruk: "ফারুক", Tanvir: "তানভীর", Sabbir: "সাব্বির", Imran: "ইমরান",
    Selim: "সেলিম", Liton: "লিটন", Ripon: "রিপন", Shakil: "শাকিল", Nayeem: "নাঈম", Hanif: "হানিফ", Delwar: "দেলোয়ার", Kawsar: "কাওসার", Ashraf: "আশরাফ", Jahid: "জাহিদ",
    Nasir: "নাসির", Masud: "মাসুদ", Rakibul: "রাকিবুল", Asaduzzaman: "আসাদুজ্জামান", Mehedi: "মেহেদী",
    Hossain: "হোসেন", Rahman: "রহমান", Islam: "ইসলাম", Ahmed: "আহমেদ", Uddin: "উদ্দিন", Miah: "মিয়া", Sarker: "সরকার", Mollah: "মোল্লা", Sheikh: "শেখ", Khan: "খান",
    Alam: "আলম", Haque: "হক", Kabir: "কবির", Talukder: "তালুকদার", Bhuiyan: "ভূঁইয়া", Akand: "আকন্দ", Mondal: "মন্ডল", Pramanik: "প্রামানিক", Hasan: "হাসান", Karim: "করিম",
    Sujon: "সুজন", Kumar: "কুমার", Das: "দাস", Pradip: "প্রদীপ", Chandra: "চন্দ্র", Roy: "রায়", Uttam: "উত্তম", Shyamal: "শ্যামল", Barman: "বর্মন", Bishwajit: "বিশ্বজিৎ",
    Ghosh: "ঘোষ", Pal: "পাল",
  };
  const toBn = (name: string) => name.split(" ").map((w) => BN_NAME[w] ?? w.replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)])).join(" ");
  const soldiers: Row[] = [];
  let snkSeq = 4_012_000;
  let offSeq = 10_420;
  const usedNames = new Set<string>();
  const makeName = (hinduOk: boolean) => {
    for (let i = 0; i < 20; i++) {
      const n = hinduOk && chance(0.06) ? pick(hindu) : `${pick(first)} ${pick(last)}`;
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
    return `${pick(first)} ${pick(last)} ${int(1, 99)}`;
  };

  function addSoldier(o: { slug: string; category: "Offr" | "JCO" | "OR"; rank: string; appointment?: string; trade?: string; age?: number; svc?: number }) {
    const age = o.age ?? (o.category === "Offr" ? int(24, 44) : o.category === "JCO" ? int(38, 48) : int(20, 42));
    const svc = o.svc ?? Math.max(1, age - (o.category === "Offr" ? 22 : 18) - int(0, 1));
    const dob = isoYearsAgo(age);
    const doe = isoYearsAgo(svc);
    const district = pick(districtsWeighted);
    const name = makeName(true);
    const married = age > 26 ? chance(0.85) : age >= 22 ? chance(0.2) : false;
    const hinduName = hindu.includes(name);
    const retireSvc = o.category === "Offr" ? 30 : o.category === "JCO" ? 32 : { Sgt: 28, Cpl: 24, "L/Cpl": 22, Snk: 20 }[o.rank] ?? 20;
    const retirement = addDays(doe, Math.round(Math.max(retireSvc, svc + int(0, 3) + 0.3) * 365.25));
    const s: Row = {
      id: uuid(),
      snk_no: o.category === "Offr" ? `BA ${offSeq++}` : String((snkSeq += 1 + int(0, 3))),
      rank: o.rank,
      category: o.category,
      trade: o.category === "Offr" ? "Signals Officer" : o.trade ?? pick(trades.slice(0, 8).concat(trades)),
      name,
      name_bn: toBn(name),
      company_id: coy[o.slug],
      platoon: o.category === "OR" ? `${int(1, 3)} Pl` : null,
      appointment: o.appointment ?? null,
      status: "Serving",
      date_of_birth: dob,
      date_of_enrolment: doe,
      date_of_rank: addDays(today, -int(90, 1800)),
      date_joined_unit: addDays(today, -int(60, 1600)),
      retirement_date: retirement,
      previous_unit: pick(["1 Sig Bn", "2 Sig Bn", "4 Sig Bn", "7 Sig Bn", "9 Sig Bn", "SST&S", "11 Sig Bn", "Army HQ Sig Bn"]),
      height_in: o.category === "Offr" ? int(64, 72) : int(63, 71),
      weight_lbs: int(122, 176),
      blood_group: pick(["A+", "B+", "B+", "O+", "O+", "O+", "AB+", "A-", "B-", "O-"]),
      medical_category: chance(0.9) ? "A" : chance(0.7) ? "B" : "C",
      medical_remarks: null,
      religion: hinduName ? "Hinduism" : "Islam",
      marital_status: married ? "Married" : "Unmarried",
      date_of_marriage: married ? addDays(dob, Math.round(int(21, Math.max(21, age - 1)) * 365.25)) : null,
      spouse_name: null,
      education: pick(["SSC", "SSC", "HSC", "HSC", "HSC", "Diploma", "Graduate"]),
      nid_no: String(int(1000000000, 9999999999)),
      home_division: divisionOf(district),
      home_district: district,
      home_upazila: pick(upazilas),
      distance_from_ib_km: chance(0.93) ? int(4, 220) : null,
      permanent_address: `Vill: ${pick(["Char", "Dakshin", "Uttar", "Purba", "Paschim"])} ${pick(["Para", "Gram", "Pur", "Hati"])}, PO: ${pick(["Bazar", "Hat", "Sadar"])}, ${district}`,
      present_address: "5 Sig Bn, Bogura Cantonment",
      ...(() => {
        const acc = !married ? (chance(0.9) ? "Snk Lines" : "Out Living") : chance(0.55) ? "Family Quarter" : chance(0.6) ? "Out Living" : "Snk Lines";
        return { accommodation: acc, accommodation_details: acc === "Family Quarter" ? `Qtr ${int(1, 60)}/${pick(["A", "B", "C"])}` : acc === "Out Living" ? `House ${int(2, 90)}, ${pick(["Jaleshwaritala", "Malotinagar", "Sutrapur", "Namazgarh"])}, Bogura` : null };
      })(),
      mobile: `01${pick(["7", "8", "9", "3", "5"])}${int(10000000, 99999999)}`,
      alt_mobile: null,
      email: null,
      emergency_name: null,
      emergency_relation: married ? "Wife" : "Father",
      emergency_mobile: `01${pick(["7", "8", "9"])}${int(10000000, 99999999)}`,
      atts_type: null,
      atts_location: null,
      atts_from: null,
      atts_to: null,
      photo_path: null,
      remarks: null,
      display_order: 0,
      created_at: now,
      updated_at: now,
    };
    if (married) s.spouse_name = `${pick(["Mst", "Mrs"])} ${pick(["Ayesha", "Fatema", "Rokeya", "Nasrin", "Shirin", "Sharmin", "Taslima", "Rina", "Moushumi", "Sumi"])} ${pick(["Begum", "Khatun", "Akter", "Sultana"])}`;
    s.emergency_name = married ? s.spouse_name : `${pick(first)} ${pick(last)}`;
    soldiers.push(s);
    return s;
  }

  // Officers
  const co = addSoldier({ slug: "bhq", category: "Offr", rank: "Lt Col", appointment: "CO", age: 43, svc: 21 });
  const twoic = addSoldier({ slug: "bhq", category: "Offr", rank: "Maj", appointment: "2IC", age: 38, svc: 16 });
  const adjt = addSoldier({ slug: "bhq", category: "Offr", rank: "Capt", appointment: "Adjt", age: 29, svc: 7 });
  addSoldier({ slug: "bhq", category: "Offr", rank: "Capt", appointment: "QM", age: 30, svc: 8 });
  const ocRdo = addSoldier({ slug: "rdo", category: "Offr", rank: "Maj", appointment: "Coy Comd", age: 35, svc: 13 });
  addSoldier({ slug: "hq", category: "Offr", rank: "Maj", appointment: "Coy Comd", age: 36, svc: 14 });
  addSoldier({ slug: "op", category: "Offr", rank: "Capt", appointment: "Coy Comd", age: 31, svc: 9 });
  addSoldier({ slug: "rr", category: "Offr", rank: "Capt", appointment: "Coy Comd", age: 30, svc: 8 });
  addSoldier({ slug: "106-bsc", category: "Offr", rank: "Lt", appointment: "Coy Comd", age: 25, svc: 3 });
  addSoldier({ slug: "113-bsc", category: "Offr", rank: "Lt", appointment: "Coy Comd", age: 25, svc: 3 });
  addSoldier({ slug: "121-bsc", category: "Offr", rank: "Lt", appointment: "Coy Comd", age: 26, svc: 4 });
  addSoldier({ slug: "205-absc", category: "Offr", rank: "Capt", appointment: "Coy Comd", age: 28, svc: 6 });

  // JCOs and OR per company — the unit's posted strength (Offr+JCO+OR):
  // BHQ 4+2+14 · HQ 1+2+26 · Radio 1+2+22 · Op 1+2+22 · RR & Line 1+2+18 · 106 1+1+13 · 113 1+1+13 · 121 1+1+12 · 205 1+1+13 · EME 0+1+9
  const plan: Array<[string, number, number]> = [["bhq", 2, 14], ["hq", 2, 26], ["rdo", 2, 22], ["op", 2, 22], ["rr", 2, 18], ["106-bsc", 1, 13], ["113-bsc", 1, 13], ["121-bsc", 1, 12], ["205-absc", 1, 13], ["eme", 1, 9]];
  // the trades each sub-unit actually holds (weighted)
  const BSC = ["Operator", "Operator", "Operator", "Technician", "Wireman Sigs", "Driver", "Crypto"];
  const coyTrades: Record<string, string[]> = {
    bhq: ["Clerk", "Clerk", "Clerk", "SMT", "Crypto", "Driver", "Cook (Mess)"],
    hq: ["Driver", "Driver", "Driver", "Cook (Unit)", "Cook (Unit)", "Cook (Mess)", "C&L", "E&BR", "SMT", "Clerk", "Technician"],
    rdo: ["Operator", "Operator", "Operator", "Technician", "Technician", "Crypto"],
    op: ["Operator", "Operator", "Operator", "Crypto", "Crypto", "Technician"],
    rr: ["Wireman Sigs", "Wireman Sigs", "Wireman Sigs", "Operator", "Technician", "Driver"],
    "106-bsc": BSC, "113-bsc": BSC, "121-bsc": BSC, "205-absc": BSC,
    eme: ["Technician", "Technician", "Technician", "E&BR", "E&BR", "Driver"],
  };
  const jcoRank = (slug: string, i: number) =>
    slug === "bhq" ? (i === 0 ? "MWO" : "SWO") : slug === "hq" && i === 0 ? "H/Capt" : (slug === "rdo" || slug === "op") && i === 0 ? "H/Lt" : pick(["SWO", "WO", "WO"]);
  const jcoAppt = (slug: string, i: number) =>
    slug === "bhq" ? (i === 0 ? "Senior JCO" : "BSM") : slug === "eme" ? "Sec JCO" : i === 0 ? "Coy JCO" : "Pl Comd";
  let rdoSgt: Row | null = null;
  let unitClk: Row | null = null;
  let demoSig: Row | null = null;
  let bsm: Row | null = null;
  for (const [slug, jcos, ors] of plan) {
    for (let i = 0; i < jcos; i++) {
      const j = addSoldier({ slug, category: "JCO", rank: jcoRank(slug, i), appointment: jcoAppt(slug, i), trade: coyTrades[slug][0] });
      if (slug === "bhq" && i === 1) bsm = j;
    }
    for (let i = 0; i < ors; i++) {
      const rank = i < 2 ? "Sgt" : i < 5 ? "Cpl" : i < 8 ? "L/Cpl" : "Snk";
      const age = rank === "Sgt" ? int(34, 40) : rank === "Cpl" ? int(28, 36) : rank === "L/Cpl" ? int(24, 32) : int(19, 30);
      const s = addSoldier({ slug, category: "OR", rank, age, trade: slug === "bhq" && i === 3 ? "Clerk" : slug === "rdo" && i === 10 ? "Operator" : pick(coyTrades[slug]), appointment: i === 0 ? (slug === "eme" ? "Sec NCO" : "Coy Hav") : undefined });
      if (slug === "rdo" && i === 0) rdoSgt = s;
      if (slug === "bhq" && i === 3) unitClk = s;
      if (slug === "rdo" && i === 10) demoSig = s;
    }
  }
  soldiers.forEach((s, i) => (s.display_order = i + 1));
  // A few seniors due to retire soon (for the retirement watch list)
  soldiers.filter((s) => s.category !== "Offr" && ["Sgt", "WO", "SWO", "MWO"].includes(s.rank)).slice(0, 7).forEach((s, i) => (s.retirement_date = addDays(today, 25 + i * 48)));
  const serving = soldiers;
  const ors = serving.filter((s) => s.category !== "Offr");

  // Attachments
  for (const s of ors.slice(30, 34)) Object.assign(s, { atts_type: "Temp Atts", atts_location: pick(["11 Inf Div Sig Bn", "Army HQ", "UN Mission Prep Centre", "Station HQ Bogura"]), atts_from: addDays(today, -int(5, 40)), atts_to: addDays(today, int(10, 60)) });
  for (const s of ors.slice(60, 62)) Object.assign(s, { atts_type: "Perm Atts", atts_location: pick(["DGFI", "BGB HQ", "SSF"]), atts_from: addDays(today, -int(100, 400)), atts_to: null });

  // ---------------------------------------------------- accounts
  const authUsers: Row[] = [];
  const profiles: Row[] = [];
  const account = (_key: string, loginId: string, role: string, label: string, _detail: string, soldier: Row | null, companyId: string | null) => {
    const id = uuid();
    authUsers.push({ id, email: `${loginId.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "-")}@${DEMO_DOMAIN}` });
    profiles.push({ id, soldier_id: soldier?.id ?? null, full_name: soldier ? `${soldier.rank} ${soldier.name}` : label, role, company_id: companyId, active: true, must_change_password: false, created_at: now, updated_at: now });
  };
  // Staff logins belong to the APPOINTMENT; "held by" records who is doing the duty.
  const appt = (loginId: string, role: string, appointment: string, holder: Row | null, companyId: string | null) => {
    const id = uuid();
    authUsers.push({ id, email: `${loginId}@${DEMO_DOMAIN}` });
    profiles.push({ id, soldier_id: null, full_name: appointment, appointment, held_by: holder ? `${holder.rank} ${holder.name}` : null, held_by_soldier: holder?.id ?? null, role, company_id: companyId, active: true, must_change_password: false, created_at: now, updated_at: now });
    if (holder) holders.push({ id: uuid(), profile_id: id, held_by: `${holder.rank} ${holder.name}`, held_by_soldier: holder.id, from_at: `${addDays(today, -int(40, 300))}T04:00:00.000Z`, to_at: null, changed_by: null });
  };
  const holders: Row[] = [];
  account("admin", "admin", "admin", "System Admin", "Users, settings, everything", null, null);
  appt("co", "co", "Commanding Officer", co, null);
  appt("2ic", "2ic", "Second-in-Command", twoic, null);
  appt("adjt", "adjt", "Adjutant", adjt, null);
  appt("rdo-comd", "coy_comd", "OC Radio Coy", ocRdo, coy.rdo);
  appt("rdo-rep", "coy_rep", "Radio Coy Rep", rdoSgt, coy.rdo);
  appt("bn-rep", "bn_rep", "BSM / Bn Daily", bsm, null);
  appt("trg-clk", "clk", "Training Clerk", unitClk, null);
  appt("ors-clk", "clk", "ORS Clerk", serving.find((x) => x.company_id === coy.bhq && x.trade === "Clerk" && x !== unitClk) ?? serving.find((x) => x.company_id === coy.bhq && x.category === "OR" && x !== unitClk) ?? null, null);
  account("soldier", demoSig!.snk_no, "soldier", `${demoSig!.rank} ${demoSig!.name}`, "Individual soldier, Radio Coy", demoSig, coy.rdo);
  // The people doing staff duties also have their own individual logins (Personal No)
  for (const s of [co, twoic, adjt, ocRdo, rdoSgt!, bsm!, unitClk!]) {
    const id = uuid();
    authUsers.push({ id, email: `${s.snk_no.toLowerCase().replace(/\s+/g, "")}@${DEMO_DOMAIN}`, password: "changeme123" });
    profiles.push({ id, soldier_id: s.id, full_name: `${s.rank} ${s.name}`, role: "soldier", company_id: s.company_id, active: true, must_change_password: false, created_at: now, updated_at: now });
  }
  // A few more soldier accounts so user management has rows
  for (const s of serving.filter((x) => x.company_id === coy.rdo && x.category === "OR").slice(12, 18)) {
    const id = uuid();
    authUsers.push({ id, email: `${s.snk_no.toLowerCase()}@${DEMO_DOMAIN}`, password: "changeme123" });
    profiles.push({ id, soldier_id: s.id, full_name: `${s.rank} ${s.name}`, role: "soldier", company_id: s.company_id, active: true, must_change_password: true, created_at: now, updated_at: now });
  }

  // ------------------------------------------------ soldier records
  const records: Row[] = [];
  const rec = (s: Row, kind: string, data: Row, record_date: string | null = null) =>
    records.push({ id: uuid(), soldier_id: s.id, company_id: s.company_id, kind, record_date, data, created_at: now, updated_at: now });
  for (const s of serving) {
    if (s.marital_status === "Married") {
      rec(s, "family", { name: s.spouse_name, relation: "Wife", date_of_birth: addDays(s.date_of_birth, int(1500, 2600)) });
      const kids = int(0, 3);
      for (let k = 0; k < kids; k++) {
        const dob = addDays(s.date_of_marriage, int(330, 3600));
        if (dob < today) rec(s, "family", { name: `${pick(["Md", "Mst"])} ${pick(["Arafat", "Sadia", "Tamim", "Nusrat", "Ayan", "Raisa", "Fahim", "Mim"])} ${pick(last)}`, relation: pick(["Son", "Daughter"]), date_of_birth: dob }, dob);
      }
    }
    rec(s, "family", { name: `${pick(first)} ${pick(last)}`, relation: "Father", occupation: pick(["Farmer", "Business", "Retired", "Late"]) });
    rec(s, "education", { exam: "SSC", institution: pick(["Rajshahi Board", "Dinajpur Board", "Dhaka Board", "Jashore Board"]), year: String(Number(s.date_of_birth.slice(0, 4)) + 16), result: `GPA ${(3 + R() * 2).toFixed(2)}` });
    if (["HSC", "Diploma", "Graduate"].includes(s.education)) rec(s, "education", { exam: "HSC", institution: pick(["Rajshahi Board", "Dinajpur Board", "Dhaka Board"]), year: String(Number(s.date_of_birth.slice(0, 4)) + 18), result: `GPA ${(3 + R() * 2).toFixed(2)}` });
    const from = addDays(s.date_of_enrolment, int(200, 700));
    if (from < today) rec(s, "course", { course: s.category === "Offr" ? "Signal Officers' Basic Course" : "Basic Trade Course", institution: "SST&S", from, to: addDays(from, 120), result: pick(["Qualified", "Qualified", "B Grade", "A Grade"]) }, from);
    if (s.category !== "Offr" && s.rank !== "Snk" && chance(0.7)) {
      const f2 = addDays(s.date_of_enrolment, int(1500, 3000));
      if (f2 < today) rec(s, "course", { course: pick(["Unit NCO Cadre", "Upgrading Course", "Instructor Course", "Advanced Trade Course"]), institution: pick(["SST&S", "Unit", "Div Trg Sch"]), from: f2, to: addDays(f2, 60), result: pick(["Qualified", "B Grade", "A Grade"]) }, f2);
    }
    rec(s, "posting", { unit: s.previous_unit, appointment: s.category === "Offr" ? "Sig Offr" : "Operator", from: s.date_of_enrolment, to: s.date_joined_unit }, s.date_of_enrolment);
    if (chance(0.08)) {
      const d = addDays(today, -int(60, 1500));
      rec(s, "discipline", { date: d, offence: pick(["Overstay of leave", "Late for parade", "Improper dress", "Absent from duty"]), section: pick(["AA Sec 38", "AA Sec 52", "AA Sec 63"]), punishment: pick(["Admonition", "7 days CB", "14 days CB", "Fine"]), awarded_by: "CO" }, d);
    }
    if (chance(0.12)) {
      const d = addDays(today, -int(60, 1800));
      rec(s, "award", { date: d, award: pick(["CO's Commendation", "Best Signaller", "Sports Champion", "UN Mission Medal", "Commander's Commendation"]), reason: pick(["Outstanding performance", "Exercise", "Inter-unit competition", "UN deployment"]) }, d);
    }
  }

  // --------------------------------------------------------- leave
  const leave: Row[] = [];
  const addLeave = (s: Row, code: string, from: string, days: number, status: string, extra: Row = {}) => {
    const to = addDays(from, days - 1);
    leave.push({
      id: uuid(), soldier_id: s.id, company_id: s.company_id, leave_type_id: lt[code], from_date: from, to_date: to, days,
      reason: pick(["Family matter", "Privilege leave", "Marriage of sister", "House construction", "Illness of father", "Personal affairs"]),
      leave_address: s.permanent_address, contact_no: s.mobile, status, applied_by: null, applied_at: `${addDays(from, -int(3, 15))}T04:00:00.000Z`,
      recommended_by: null, recommended_at: ["Recommended", "Approved"].includes(status) ? `${addDays(from, -3)}T05:00:00.000Z` : null, recommend_remarks: ["Recommended", "Approved"].includes(status) ? "Recommended" : null,
      decided_by: null, decided_at: status === "Approved" || status === "Rejected" ? `${addDays(from, -2)}T05:00:00.000Z` : null, decision_remarks: status === "Approved" ? "Approved" : status === "Rejected" ? "Not approved due to commitments" : null,
      rejoin_date: null, rejoin_by: null, created_at: now, updated_at: now, ...extra,
    });
  };
  const pool = serving.filter((s) => !s.atts_type && s.id !== demoSig!.id);
  const shuffled = [...pool].sort(() => R() - 0.5);
  let p = 0;
  // currently on leave
  for (let i = 0; i < 14; i++) {
    const k = int(1, 20);
    addLeave(shuffled[p++], pick(["PL", "PL", "CL"]), addDays(today, -k), k + int(2, 18), "Approved");
  }
  // on medical leave
  for (let i = 0; i < 2; i++) addLeave(shuffled[p++], "MEDL", addDays(today, -int(2, 8)), int(10, 21), "Approved", { reason: "Medical leave on CMH recommendation" });
  // one overstayed (rejoin not reported)
  addLeave(shuffled[p++], "CL", addDays(today, -12), 10, "Approved");
  // pending applications
  for (let i = 0; i < 4; i++) addLeave(shuffled[p++], pick(["PL", "CL"]), addDays(today, int(3, 20)), int(5, 25), "Applied");
  for (let i = 0; i < 3; i++) addLeave(shuffled[p++], "PL", addDays(today, int(2, 15)), int(10, 30), "Recommended");
  // future approved
  for (let i = 0; i < 3; i++) addLeave(shuffled[p++], "PL", addDays(today, int(2, 25)), int(15, 30), "Approved");
  // history this year (rejoined)
  for (const s of shuffled.slice(p, p + 70)) {
    const from = addDays(today, -int(40, 280));
    const days = int(10, 30);
    if (from.slice(0, 4) === String(year)) addLeave(s, pick(["PL", "PL", "CL"]), from, days, "Approved", { rejoin_date: addDays(from, days) });
  }
  p += 70;
  addLeave(shuffled[p++], "PL", addDays(today, -30), 15, "Rejected");
  // demo soldier: used some leave this year
  addLeave(demoSig!, "PL", addDays(today, -150), 30, "Approved", { rejoin_date: addDays(today, -120) });
  addLeave(demoSig!, "CL", addDays(today, -60), 7, "Approved", { rejoin_date: addDays(today, -53) });
  // everyone else: his last leave ended 2 weeks to 4 months ago (for the "leave due every 3 months" list)
  const hadLeave = new Set(leave.map((l) => l.soldier_id));
  for (const s of serving) {
    if (hadLeave.has(s.id) || s.atts_type === "Perm Atts") continue;
    const endAgo = int(10, 96), days = int(10, 30);
    addLeave(s, pick(["PL", "PL", "CL"]), addDays(today, -endAgo - days + 1), days, "Approved", { rejoin_date: addDays(today, -endAgo + 1) });
  }

  // ------------------------------------------------------- courses
  const courses: Row[] = [];
  const addCourse = (s: Row, name: string, inst: string, type: string, from: string, days: number, status: string, extra: Row = {}) =>
    courses.push({ id: uuid(), soldier_id: s.id, company_id: s.company_id, course_name: name, institution: inst, course_type: type, from_date: from, to_date: addDays(from, days), status, result: null, grade: null, part1_no: null, remarks: null, created_at: now, updated_at: now, ...extra });
  for (let i = 0; i < 6; i++) addCourse(shuffled[p++], pick(["Basic Radio Operator Course", "Advanced Computer Course", "Cyber Security Course", "Unit Clerk Course", "Line Technician Course"]), pick(["SST&S", "EME Centre", "AFNS", "MIST"]), "External", addDays(today, -int(10, 60)), int(70, 120), "Attending");
  for (let i = 0; i < 4; i++) addCourse(shuffled[p++], "Unit NCO Cadre", "Unit", "Internal", addDays(today, -int(1, 10)), 28, "Attending");
  for (let i = 0; i < 4; i++) addCourse(shuffled[p++], pick(["Upgrading Course", "Instructor Course (Signals)"]), "SST&S", "External", addDays(today, int(10, 40)), 60, "Nominated");
  for (let i = 0; i < 10; i++) addCourse(shuffled[p++], pick(["Basic Radio Operator Course", "Upgrading Course", "Unit NCO Cadre"]), pick(["SST&S", "Unit"]), pick(["External", "Internal"]), addDays(today, -int(150, 330)), 45, "Completed", { result: "Qualified", grade: pick(["A", "B", "B", "C"]) });

  // -------------------------------------------------- sick reports
  const sick: Row[] = [];
  const addSick = (s: Row, date: string, disposal: string, extra: Row = {}) =>
    sick.push({ id: uuid(), soldier_id: s.id, company_id: s.company_id, report_date: date, complaint: pick(["Fever", "Back pain", "Ankle sprain", "Gastritis", "Dengue suspected", "Injury during sports"]), disposal, days: 1, hospital: null, discharge_date: null, remarks: null, created_at: now, updated_at: now, ...extra });
  addSick(shuffled[p++], addDays(today, -3), "Admitted", { hospital: "CMH Bogura", days: 0 });
  addSick(shuffled[p++], addDays(today, -1), "Admitted", { hospital: "CMH Bogura", days: 0 });
  addSick(shuffled[p++], addDays(today, -9), "Admitted", { hospital: "CMH Bogura", days: 0, discharge_date: addDays(today, -4) });
  for (let i = 0; i < 3; i++) addSick(shuffled[p++], today, "Excused Duty", { days: int(2, 5) });
  for (let i = 0; i < 2; i++) addSick(shuffled[p++], today, "Light Duty", { days: 3 });
  for (let i = 0; i < 4; i++) addSick(shuffled[p++], today, "Duty");
  for (let i = 0; i < 8; i++) addSick(shuffled[p++], addDays(today, -int(2, 9)), pick(["Duty", "Excused Duty", "Light Duty"]), { days: int(1, 3) });

  // --------------------------------------------------- duty roster
  const duties: Row[] = [];
  const busy = new Set([...leave.filter((l) => l.status === "Approved" && !l.rejoin_date).map((l) => l.soldier_id), ...courses.filter((c) => c.status === "Attending").map((c) => c.soldier_id), ...sick.map((x) => x.soldier_id)]);
  const dutyFree = pool.filter((s) => s.category === "OR" && !busy.has(s.id));
  const officers = serving.filter((s) => s.category === "Offr");
  const jcos = serving.filter((s) => s.category === "JCO");
  const nco = dutyFree.filter((s) => ["Sgt", "Cpl"].includes(s.rank));
  const guard = dutyFree.filter((s) => ["L/Cpl", "Snk"].includes(s.rank) && !/Cook|Clerk/.test(s.trade));
  const snk = dutyFree.filter((s) => s.rank === "Snk").reverse();
  const clerks = dutyFree.filter((s) => s.trade === "Clerk").concat(dutyFree.filter((s) => s.trade === "SMT"));
  for (let d = -10; d <= 1; d++) {
    const date = addDays(today, d);
    const used = new Set<string>();
    const add = (s: Row, duty: string, shift: string | null = null) => {
      if (used.has(s.id)) return;
      used.add(s.id);
      duties.push({ id: uuid(), date, duty_type: duty, soldier_id: s.id, company_id: s.company_id, shift, remarks: null, created_by: null, created_at: now });
    };
    const offrs = officers.filter((o) => ["Capt", "Lt"].includes(o.rank));
    add(offrs[(d + 20) % offrs.length], "Duty Offr");
    add(jcos[(d + 20) % jcos.length], "Duty JCO");
    // each duty goes to the right rank / trade, taking turns day by day
    const turn = (list: Row[], n: number, k = 0) => list[((d + 10) * n + k) % list.length];
    add(turn(nco, 1), "Duty NCO");
    for (let k = 0; k < 4; k++) add(turn(guard, 4, k), "Quarter Guard", `${["0600-1200", "1200-1800", "1800-2400", "0000-0600"][k]}`);
    add(turn(snk, 3, 1), "Duty Runner");
    add(turn(clerks, 1), "Duty Clk");
    add(turn(snk, 3, 2), "Night Picket");
    add(turn(snk, 3, 0), "Station Duty (Mess B)");
  }

  // ------------------------------------------------------ training
  const training: Row[] = [];
  const addTr = (s: Row, code: string, seq: number, attempt: number, date: string, result: string, marks: number | null = null) =>
    date <= today &&
    training.push({ id: uuid(), soldier_id: s.id, company_id: s.company_id, training_type_id: tt[code], year, sequence_no: seq, attempt_no: attempt, test_date: date, result, marks, grade: null, part1_no: `P1/${year}/${int(10, 99)}`, remarks: null, created_at: now, updated_at: now });
  const yStart = `${year}-01-01`;
  const dayOfYear = (date: string) => (date < yStart ? yStart : date);
  for (const s of serving) {
    if (s.atts_type === "Perm Atts") continue;
    // automatic exemption (age 45+ or Med Cat B/C/D): no IPFT / RET / Speed March records — the system shows "Exempted"
    const ageNow = Number(today.slice(0, 4)) - Number(s.date_of_birth.slice(0, 4));
    if (ageNow >= 45 || ["B", "C", "D"].includes(s.medical_category)) {
      if (s.category !== "Offr" && chance(0.6)) addTr(s, "GT", 1, 1, `${year}-0${int(2, 9)}-${String(int(5, 25)).padStart(2, "0")}`, "Pass");
      continue;
    }
    // IPFT period 1 (Jan-Jun)
    if (chance(0.92)) {
      if (chance(0.12)) {
        addTr(s, "IPFT", 1, 1, `${year}-03-12`, "Fail");
        if (chance(0.25)) {
          addTr(s, "IPFT", 1, 2, `${year}-04-10`, "Fail");
          addTr(s, "IPFT", 1, 3, `${year}-05-08`, chance(0.7) ? "Pass" : "Fail");
        } else if (chance(0.75)) addTr(s, "IPFT", 1, 2, `${year}-04-10`, "Pass");
      } else addTr(s, "IPFT", 1, 1, `${year}-03-12`, "Pass");
    }
    // IPFT period 2 (Jul-Dec) partially done
    if (chance(0.45)) addTr(s, "IPFT", 2, 1, `${year}-09-${String(int(10, 28)).padStart(2, "0")}`, chance(0.93) ? "Pass" : "Fail");
    // RET
    if (chance(0.68)) {
      const m = int(10, 20);
      addTr(s, "RET", 1, 1, `${year}-0${int(4, 8)}-${String(int(10, 25)).padStart(2, "0")}`, m >= 13 ? "Pass" : "Fail", m);
    }
    // Speed March 1-4
    const sm = chance(0.85) ? (chance(0.15) ? 4 : int(1, 3)) : 0;
    for (let n = 1; n <= sm; n++) addTr(s, "SM", n, 1, `${year}-${String(Math.min(n * 3 - 1, 10)).padStart(2, "0")}-${String(int(5, 15)).padStart(2, "0")}`, "Pass");
    if (s.category !== "Offr" && chance(0.62)) addTr(s, "GT", 1, 1, `${year}-0${int(2, 9)}-${String(int(5, 25)).padStart(2, "0")}`, chance(0.75) ? "Pass" : "Ongoing");
  }

  // Training calendar
  const events: Row[] = [];
  const addEvent = (title: string, type: string, start: number, len: number, extra: Row = {}) =>
    events.push({ id: uuid(), title, event_type: type, training_type_id: null, company_id: null, start_date: addDays(today, start), end_date: addDays(today, start + len - 1), venue: null, conducting_officer: null, description: null, status: start + len <= 0 ? "Completed" : start <= 0 ? "Ongoing" : "Planned", created_by: null, created_at: now, updated_at: now, ...extra });
  addEvent("IPFT — 2nd Bi-Annual", "Test", 3, 3, { training_type_id: tt.IPFT, venue: "Unit Parade Ground", conducting_officer: `${adjt.rank} ${adjt.name}` });
  addEvent("Speed March No 4", "Test", 12, 1, { training_type_id: tt.SM, venue: "Cantonment Route", conducting_officer: "OC HQ Coy" });
  addEvent("Annual Firing (RET) — Remaining personnel", "Range", 18, 4, { training_type_id: tt.RET, venue: "Majhira Range" });
  addEvent("Unit NCO Cadre", "Cadre", -5, 28, { venue: "Unit Lecture Hall", conducting_officer: "2IC" });
  addEvent("Signal Exercise 'Sure Link'", "Exercise", 25, 5, { venue: "Field Area", description: "Battalion communication exercise with formation HQ." });
  addEvent("Weekly Lecture: Cyber Hygiene", "Lecture", 1, 1, { venue: "Auditorium" });
  addEvent("Inter-Coy Football Final", "Sports", 6, 1, { venue: "Unit Ground" });
  addEvent("Radio Coy Equipment Inspection", "Inspection", 4, 1, { company_id: coy.rdo, venue: "Radio Coy Lines" });
  addEvent("Map Reading Refresher", "Training", -40, 3, { status: "Completed" });

  // Daily programme (today & tomorrow)
  const prog: Row[] = [];
  const addProg = (dayOffset: number, from: string, to: string, activity: string, venue: string, participants: string, responsible: string, dress = "PT Dress", extra: Row = {}) =>
    prog.push({ id: uuid(), date: addDays(today, dayOffset), time_from: from, time_to: to, activity, venue, participants, company_id: null, responsible, dress, remarks: null, status: "Planned", created_by: null, created_at: now, updated_at: now, ...extra });
  for (const d of [0, 1]) {
    addProg(d, "06:00", "07:00", "PT / Games", "Unit Ground", "All ranks (less exempted)", "Coy Comds");
    addProg(d, "07:30", "07:45", "1st Parade State to Adjt", "BHQ", "Coy Reps", "Coy Reps", "Working Dress");
    addProg(d, "08:00", "08:30", "Unit Fall-in & Roll Call", "Parade Ground", "All ranks", "Adjt", "Uniform");
    addProg(d, "08:30", "12:30", "Trade Training / Office Work", "Coy Lines", "All ranks", "Coy Comds", "Uniform");
    addProg(d, "12:30", "14:00", "Lunch & Rest", "—", "All", "—", "—");
    addProg(d, "14:00", "14:15", "2nd Parade State to Adjt", "BHQ", "Coy Reps", "Coy Reps", "Working Dress");
    addProg(d, "15:30", "17:00", "Games", "Unit Ground", "All ranks", "Sports Offr", "Games Dress");
  }
  addProg(0, "10:00", "11:00", "CO's Darbar", "Unit Auditorium", "All JCOs & NCOs", "Senior JCO", "Uniform");
  addProg(1, "09:00", "12:00", "Radio Coy Equipment Maintenance", "Radio Coy Lines", "Radio Coy", "OC Radio Coy", "Working Dress", { company_id: coy.rdo });

  // Notices
  const notices: Row[] = [
    { title: "IPFT 2nd Bi-Annual starts in 3 days", body: "All ranks who have not yet appeared in IPFT 2nd Bi-Annual will report to the parade ground at 0600 hrs. Coy Comds to ensure 100% attendance. Medical category personnel to carry their documents.", category: "Order", priority: "Urgent", company_id: null, publish_date: today },
    { title: "Leave applications for next month", body: "Leave applications for the coming month must reach the Orderly Room through Coy Comds by the 25th of this month.", category: "Notice", priority: "Important", company_id: null, publish_date: addDays(today, -2) },
    { title: "Blood donation programme", body: "CMH Bogura will hold a blood donation camp in the unit. Willing personnel may give names to the Coy JCO.", category: "Event", priority: "Normal", company_id: null, publish_date: addDays(today, -4), expiry_date: addDays(today, 10) },
    { title: "Radio Coy: equipment inspection", body: "All Radio Coy sets will be presented for inspection. Detachment comds to prepare inventory.", category: "Order", priority: "Important", company_id: coy.rdo, publish_date: addDays(today, -1) },
    { title: "Update your profile information", body: "Every soldier can now log in with his Personal No and check his personal file. Request corrections from 'My Profile' — the clerk will verify and approve.", category: "Circular", priority: "Normal", company_id: null, publish_date: addDays(today, -6) },
  ].map((n) => ({ id: uuid(), expiry_date: null, created_by: null, created_at: now, updated_at: now, ...n }));

  // ITP items (custom) for Radio Coy OR
  const itp: Row[] = [];
  for (const s of serving.filter((x) => x.company_id === coy.rdo && x.category === "OR")) {
    const items: Array<[string, string, number, string]> = [
      ["Trade test: Class upgrade", "Trade", int(2, 11), chance(0.4) ? "Completed" : "Planned"],
      ["Computer literacy module", "Education", int(3, 10), chance(0.5) ? "Completed" : "In Progress"],
      ["Night navigation exercise", "Physical", int(5, 11), chance(0.3) ? "Completed" : "Planned"],
    ];
    if (s.rank !== "Snk") items.push(["Unit NCO Cadre", "Cadre", int(9, 12), "In Progress"]);
    for (const [title, category, month, status] of items)
      itp.push({ id: uuid(), soldier_id: s.id, company_id: s.company_id, year, title, category, target_date: `${year}-${String(month).padStart(2, "0")}-28`, status, completed_date: status === "Completed" ? `${year}-${String(Math.min(month, Number(today.slice(5, 7)))).padStart(2, "0")}-15` : null, remarks: null, created_at: now, updated_at: now });
  }

  // Pending profile change requests
  const pcr: Row[] = [
    { soldier_id: demoSig!.id, changes: { mobile: "01712345678", present_address: "Family quarter B-12, Bogura Cantonment" }, old_values: { mobile: demoSig!.mobile, present_address: demoSig!.present_address }, record_ops: [], note: "Changed my phone number and moved to family quarter." },
    { soldier_id: pool[5].id, changes: { blood_group: "B+" }, old_values: { blood_group: pool[5].blood_group }, record_ops: [{ op: "add", kind: "family", data: { name: "Md Ayaan Hasan", relation: "Son", date_of_birth: addDays(today, -40) } }], note: "Blood group corrected as per CMH report; new son born." },
  ].map((r) => ({ id: uuid(), company_id: soldiers.find((s) => s.id === r.soldier_id)!.company_id, requested_by: null, status: "Pending", reviewed_by: null, reviewed_at: null, review_remarks: null, created_at: `${addDays(today, -1)}T06:00:00.000Z`, ...r }));

  // Training activity photos (bundled demo illustrations)
  const photos: Row[] = [
    ["pt.svg", 0, "Morning PT — all ranks", null],
    ["signals.svg", -1, "Signal exercise: rear link established", coy.rdo],
    ["firing.svg", -2, "RET practice — remaining personnel", null],
    ["lecture.svg", -3, "Weekly lecture: cyber hygiene", null],
    ["march.svg", -5, "Speed March No 3", null],
    ["sports.svg", -6, "Inter-coy football semi-final", null],
  ].map(([file, d, caption, cid]) => ({ id: uuid(), taken_on: addDays(today, d as number), caption, event_id: null, company_id: cid, path: `/demo/training/${file}`, uploaded_by: null, created_at: now }));

  // "Apply for new ID" requests waiting for the Adjt (demo password: newid1234)
  const apps: Row[] = [
    { snk_no: "4099101", rank: "Snk", name: "Md Arafat Hossain", name_bn: "মোঃ আরাফাত হোসেন", slug: "rdo", district: "Naogaon", dist: 18, trade: "Operator", dob: "2005-03-14", enr: "2024-01-08", mob: "01712-450981", days: -1 },
    { snk_no: "4099102", rank: "Snk", name: "Md Tanjil Ahmed", name_bn: "মোঃ তানজিল আহমেদ", slug: "op", district: "Dinajpur", dist: 42, trade: "Wireman Sigs", dob: "2004-11-02", enr: "2023-07-16", mob: "01815-772310", days: 0 },
  ].map((a) => ({
    id: uuid(), snk_no: a.snk_no, category: "OR", rank: a.rank, name: a.name, company_id: coy[a.slug], status: "Pending",
    submitted_at: `${addDays(today, a.days)}T04:${a.days ? "20" : "45"}:00.000Z`, reviewed_by: null, reviewed_at: null, review_remarks: null, soldier_id: null, user_id: null,
    data: {
      name_bn: a.name_bn, trade: a.trade, platoon: "1 Pl", date_joined_unit: addDays(today, -20), previous_unit: "Signal Training Centre & School",
      date_of_birth: a.dob, date_of_enrolment: a.enr, height_in: "66", weight_lbs: "128", blood_group: "B+", medical_category: "A",
      religion: "Islam", marital_status: "Unmarried", education: "HSC", nid_no: "19" + a.snk_no + "12",
      home_division: "Rajshahi", home_district: a.district, home_upazila: "Sadar", distance_from_ib_km: String(a.dist),
      permanent_address: `Vill: Chakpara, PO: Sadar, ${a.district}`, present_address: "5 Signal Battalion lines", mobile: a.mob,
      emergency_name: "Md Abdul Hamid", emergency_relation: "Father", emergency_mobile: "01700-112233",
    },
    records: [{ kind: "family", data: { name: "Md Abdul Hamid", relation: "Father", occupation: "Farmer" } }, { kind: "education", data: { exam: "HSC", institution: "Rajshahi Board", year: "2022", result: "GPA 4.50" } }],
  }));
  const appSecrets: Row[] = apps.map((a) => ({ application_id: a.id, password: "newid1234" }));

  // ---- APR (JCO / OR) and OPR (officers) for the last 3 years
  const grading = (m: number) => (m >= 90 ? "Outstanding" : m >= 82 ? "Above Average" : m >= 74 ? "High Average" : m >= 62 ? "Average" : "Below Average");
  for (const s of serving) {
    for (let k = 1; k <= 3; k++) {
      const yr = year - k;
      if (Number(String(s.date_of_enrolment).slice(0, 4)) >= yr) continue;
      const m = int(64, 95);
      records.push({ id: uuid(), soldier_id: s.id, company_id: s.company_id, kind: "report", record_date: `${yr}-12-31`,
        data: { year: String(yr), type: s.category === "Offr" ? "OPR" : "APR", marks: String(m), grading: grading(m), remarks: pick(["Hardworking and reliable", "Good at trade, needs to improve PT", "Disciplined, suitable for promotion", "Sincere and dependable", "Very good leadership qualities"]), initiated_by: s.category === "Offr" ? "CO" : "Coy Comd" }, created_at: now });
    }
  }

  // ---- personal vehicles (about one in three)
  const VEH: Array<[string, string[]]> = [["Motorcycle", ["Honda CB Hornet 160R", "Bajaj Pulsar 150", "TVS Apache RTR", "Yamaha FZS"]], ["Bicycle", ["Phoenix", "Duranta", "Veloce"]], ["Scooty", ["Honda Dio", "TVS Wego"]], ["Car", ["Toyota Axio", "Toyota Premio", "Honda Grace"]]];
  serving.forEach((s, i) => {
    if (i % 3 !== 0) return;
    const [type, models] = VEH[s.category === "Offr" ? (i % 2 ? 3 : 0) : i % 9 === 0 ? 1 : i % 7 === 0 ? 2 : 0];
    const motor = type !== "Bicycle";
    const perm = motor ? (i % 11 === 0 ? "Applied" : "Granted") : "Not required";
    const pd = addDays(today, -int(30, 600));
    records.push({ id: uuid(), soldier_id: s.id, company_id: s.company_id, kind: "vehicle", record_date: null, created_at: now,
      data: { vehicle_type: type, make_model: pick(models), reg_no: motor ? `Bogura ${type === "Car" ? "Ga" : "Ha"} ${int(11, 15)}-${int(1000, 9999)}` : "", colour: pick(["Black", "Red", "Blue", "Silver", "White"]), owner: pick(["Self", "Self", "Self", "Wife"]),
        licence_no: motor ? `BG${int(1000000, 9999999)}` : "", licence_type: type === "Car" ? "Light (non-professional)" : motor ? "Motorcycle" : "Not required", licence_expiry: motor ? addDays(today, int(-40, 1500)) : "",
        permission: perm, permission_no: perm === "Granted" ? `Stn HQ/${int(100, 999)}/${pd.slice(0, 4)}` : "", permission_date: perm === "Granted" ? pd : "", permission_valid_till: perm === "Granted" ? addDays(pd, 365) : "", remarks: "" } });
  });

  // ---- 4-cycle plan for the year (rotation by company, as a Coy Comd would plan)
  const ACT = ["Indl Training", "Group Training", "Unit Admin", "Privilege Leave"];
  const cyclePlans: Row[] = serving.filter((s) => s.category !== "Offr").map((s, i) => {
    const r = i % 4;
    const order = [0, 1, 2, 3].map((k) => ACT[(k + r) % 4]);
    return { id: uuid(), soldier_id: s.id, company_id: s.company_id, year, c1: order[0], c2: order[1], c3: order[2], c4: order[3], remarks: null, updated_at: now };
  });

  // ---- officers' commitments (Adjt keeps the board)
  const offrs = serving.filter((x) => x.category === "Offr");
  // ---- officers' tasks (responsibilities with a deadline)
  const tasks: Row[] = [];
  const addT = (title: string, who: Row[], d: number | null, category: string, status: string, priority = "Normal", details: string | null = null) =>
    tasks.push({ id: uuid(), title, details, category, priority, status, deadline: d === null ? null : addDays(today, d), assigned_to: who.map((x) => x?.id), remarks: null,
      completed_at: status === "Completed" ? `${addDays(today, -1)}T08:00:00.000Z` : null, created_by: null, created_at: `${addDays(today, -10)}T04:00:00.000Z` });
  const byAppt = (a: string, n = 0) => offrs.filter((x) => x.appointment === a)[n];
  addT("Prepare inquiry report — vehicle accident", [byAppt("Coy Comd", 0)], 4, "Inquiry / Board", "In Progress", "High", "Convening order of 15 Oct. Submit findings to Adjt.");
  addT("Annual inspection preparation — Coy stores", [byAppt("Coy Comd", 1)], 9, "Inspection", "Pending");
  addT("Range classification plan for 2nd half", [byAppt("Adjt")], 2, "Training", "In Progress", "High");
  addT("Update unit standing orders (SOPs)", [byAppt("2IC")], 20, "Admin", "Pending");
  addT("QM stock verification board", [byAppt("QM"), byAppt("Coy Comd", 2)], -2, "Inquiry / Board", "Pending", "Urgent");
  addT("Signal exercise detailed plan", [byAppt("Coy Comd", 0), byAppt("Coy Comd", 2)], 6, "Operations", "Pending", "High");
  addT("Welfare meeting minutes", [byAppt("Adjt")], -1, "Welfare", "Completed");
  addT("NCO cadre syllabus", [byAppt("Coy Comd", 3)], 12, "Course / Cadre", "On Hold", "Low", "Waiting for instructor nomination from Bde.");
  addT("Line maintenance schedule — 121 BSC", [byAppt("Coy Comd", 6)], 5, "Signals / Technical", "Pending");
  addT("CO's quarterly review brief", [byAppt("CO")], 14, "Admin", "Pending", "High");
  for (const t of tasks) t.assigned_to = t.assigned_to.filter(Boolean);
  const commitments: Row[] = [];
  const addC = (d: number, from: string, to: string | null, s: Row, title: string, venue: string | null) => commitments.push({ id: uuid(), date: addDays(today, d), time_from: from, time_to: to, soldier_id: s.id, title, venue, remarks: null, created_by: null, created_at: now });
  addC(0, "09:00", "10:30", co, "Bde Comd's conference", "Bde HQ");
  addC(0, "11:30", "12:30", co, "CO's interview (new arrivals)", "CO's office");
  addC(0, "15:00", null, co, "Visit to Signal Centre", "Signal Centre");
  addC(0, "10:00", "11:00", twoic, "Board of officers — MT", "Unit Conference Room");
  addC(0, "08:30", "09:30", adjt, "Durbar preparation", "Parade Ground");
  addC(1, "10:00", "13:00", co, "Station Comd's meeting", "Station HQ");
  addC(1, "09:00", null, ocRdo, "Exercise recce", "Training Area");
  addC(2, "08:00", "12:00", co, "Div Signal exercise — closing", "Div HQ");
  addC(3, "11:00", "12:00", adjt, "Court of inquiry", "Unit Conference Room");
  for (const o of offrs.slice(5, 9)) addC(int(0, 4), pick(["09:00", "10:00", "14:00"]), null, o, pick(["Range duty", "Board of officers", "Lecture to OR", "Inspection of coy lines"]), pick(["Range", "Coy Lines", "Lecture Hall"]));

  return {
    cycle_plans: cyclePlans, officer_commitments: commitments, officer_tasks: tasks, appointment_holders: holders,
    id_applications: apps, id_application_secrets: appSecrets,
    training_photos: photos,
    companies, leave_types: leaveTypes, training_types: trainingTypes, app_settings: settings,
    soldiers, soldier_records: records, auth_users: authUsers, profiles,
    leave_applications: leave, course_nominations: courses, sick_reports: sick, duty_roster: duties,
    training_records: training, training_events: events, daily_programmes: prog, notices, itp_items: itp,
    profile_change_requests: pcr,
    parade_states: [], parade_entries: [], coy_submissions: [], audit_log: [], photos: [],
  };
}

/** Demo accounts shown on the login page (independent of the stored data). */
export function demoAccounts(store: Record<string, Row[]>) {
  const order = ["admin", "co", "2ic", "adjt", "coy_comd", "coy_rep", "bn_rep", "clk", "soldier"];
  const companies = new Map((store.companies ?? []).map((c) => [c.id, c.name]));
  const out: Array<{ role: string; loginId: string; name: string; detail: string }> = [];
  for (const role of order) {
    const p = (store.profiles ?? []).find((x) => x.role === role && x.active && !(store.auth_users ?? []).find((u) => u.id === x.id)?.password);
    if (!p) continue;
    const u = (store.auth_users ?? []).find((x) => x.id === p.id);
    const s = (store.soldiers ?? []).find((x) => x.id === p.soldier_id);
    out.push({
      role,
      loginId: u?.email.split("@")[0] ?? "",
      name: p.full_name ?? "",
      detail: p.held_by ? `held by ${p.held_by}` : s?.appointment ?? (p.company_id ? companies.get(p.company_id) ?? "" : "Whole unit"),
    });
  }
  return out;
}
