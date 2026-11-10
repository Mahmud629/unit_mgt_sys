// ============================================================================
//  5 SIG BN — Unit Systems Portal : settings
//  Edit this file only. Save, then refresh the portal page.
//
//  systems : each program the portal starts and links to.
//    url    : its address. {host} becomes the address people typed to open the
//             portal (e.g. 192.168.1.10), so one file works on every LAN computer.
//    serve  : the portal serves this system's built pages ("out" folder) on the
//             port; "build" is the project folder, installed and built the first time.
//    run    : the portal starts this system's own server ("npm run <script>").
//    tiles  : the tiles shown for this system. "path" is added to its url.
//             icon: database, clipboard, target, briefcase, calendar, settings, boxes
//             (or logo: "assets/<picture>")
//
//  Daily activities pictures: put photos (.jpg / .png / .webp) in the folder
//  portal\activities. Name them like  "2026-10-25 Annual Firing.jpg"  — the
//  date and the words become the caption. Newest first. Delete the sample-*.svg
//  files when you have your own.
// ============================================================================
window.PORTAL_CONFIG = {
  unit: {
    name: "5 Signal Battalion",
    name_bn: "৫ সিগন্যাল ব্যাটালিয়ন",
    short: "5 SIG BN",
  },
  portalPort: 8080,
  openInNewTab: false,
  activities: { folder: "activities", max: 40, secondsPerPicture: 5 },
  systems: [
    {
      id: "ums",
      name: "Unit Management System",
      name_bn: "ইউনিট ব্যবস্থাপনা সিস্টেম",
      code: "UMS",
      url: "http://{host}:8081/",
      serve: { folder: "../ums/out", port: 8081, build: "../ums" },
      tiles: [
        { id: "personnel", name: "Soldiers' Database", name_bn: "সৈনিক ডাটাবেজ", icon: "database", color: "#2f6f9f", path: "go/?to=personnel" },
        { id: "parade", name: "Parade State & Leave", name_bn: "প্যারেড স্টেট ও ছুটি", icon: "clipboard", color: "#23806f", path: "go/?to=parade" },
        { id: "training", name: "Training", name_bn: "প্রশিক্ষণ", icon: "target", color: "#b0702a", path: "go/?to=training" },
        { id: "officers", name: "Officers' Desk", name_bn: "অফিসার্স ডেস্ক", icon: "briefcase", color: "#8a3a52", path: "go/?to=officers" },
        { id: "daily", name: "Daily Activities", name_bn: "দৈনিক কার্যক্রম", icon: "calendar", color: "#5a5aa8", path: "go/?to=daily" },
        // Administration is opened from inside the UMS. To show it here too, remove the // below.
        // { id: "admin", name: "Administration", name_bn: "প্রশাসন", icon: "settings", color: "#56636e", path: "go/?to=admin" },
      ],
    },
    {
      id: "inventory",
      name: "Unit Inventory Management System",
      name_bn: "ইউনিট ইনভেন্টরি ব্যবস্থাপনা সিস্টেম",
      code: "UIMS",
      url: "http://{host}:8082/",
      run: { folder: "../inventory", script: "start:portal", port: 8082 },
      tiles: [
        { id: "inventory", name: "Unit Inventory", name_bn: "ইউনিট ইনভেন্টরি", logo: "assets/inventory-logo.png", color: "#4f7a4a", path: "" },
      ],
    },
  ],
};
