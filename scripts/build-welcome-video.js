import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public", "assets", "stand-out-on-google.mp4");
const CONCAT_LIST = join(ROOT, ".tmp-concat.txt");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

const W = 1280, H = 720, FPS = 24;
const BG    = "0x0f172a";
const BLUE  = "0x0ea5e9";
const WHITE = "0xf8fafc";
const MUTED = "0x94a3b8";
const GOLD  = "0xf59e0b";

// Font paths - backslash-colon escaping required by ffmpeg drawtext on Windows
const FONT_REG  = "C\\:/Windows/Fonts/arial.ttf";
const FONT_BOLD = "C\\:/Windows/Fonts/arialbd.ttf";
const FONT_ITAL = "C\\:/Windows/Fonts/arialbi.ttf";

const SLIDES = [
  {
    dur: 4,
    lines: [
      { text: "PRIME LOCAL GROWTH",            y: 260, size: 54, color: BLUE,  bold: true },
      { text: "Stand Out on Google.",           y: 340, size: 72, color: WHITE, bold: true },
      { text: "How it works - 2 minutes.",      y: 430, size: 30, color: MUTED },
    ],
  },
  {
    dur: 5,
    lines: [
      { text: "STEP 1",                                    y: 140, size: 20, color: BLUE,  bold: true },
      { text: "We optimize your Google listing.",          y: 230, size: 50, color: WHITE, bold: true },
      { text: "Keywords, photos and services updated",     y: 330, size: 26, color: MUTED },
      { text: "Review monitoring activated",               y: 376, size: 26, color: MUTED },
      { text: "Google Posts every week",                   y: 422, size: 26, color: MUTED },
    ],
  },
  {
    dur: 5,
    lines: [
      { text: "STEP 2",                                           y: 140, size: 20, color: BLUE,  bold: true },
      { text: "You grant Manager access.",                        y: 230, size: 50, color: WHITE, bold: true },
      { text: "Takes 3 minutes with our step-by-step guide.",     y: 316, size: 26, color: MUTED },
      { text: "Add adam@primelocalgrowth.com",                    y: 380, size: 26, color: MUTED },
      { text: "Role: Manager (not Owner)",                        y: 426, size: 26, color: MUTED },
      { text: "You stay Primary Owner - always",                  y: 472, size: 26, color: MUTED },
    ],
  },
  {
    dur: 5,
    lines: [
      { text: "WHAT HAPPENS NEXT",                              y: 140, size: 20, color: BLUE,  bold: true },
      { text: "Results start within 24 hours.",                 y: 230, size: 50, color: WHITE, bold: true },
      { text: "Hour 0-2   Full diagnostic audit",               y: 330, size: 26, color: MUTED },
      { text: "Hour 2-12  360 degree optimization live",        y: 376, size: 26, color: MUTED },
      { text: "Hour 12-24 Posting and review monitoring on",    y: 422, size: 26, color: MUTED },
    ],
  },
  {
    dur: 5,
    lines: [
      { text: "Within 1 day my phones",        y: 240, size: 48, color: WHITE, bold: true },
      { text: "started ringing again.",         y: 300, size: 48, color: WHITE, bold: true },
      { text: "Bushwacked Paint and Renovations", y: 400, size: 24, color: GOLD },
      { text: "Verified Google Review",           y: 436, size: 20, color: MUTED },
    ],
  },
  {
    dur: 4,
    lines: [
      { text: "YOUR NEXT STEP",                                    y: 200, size: 20, color: BLUE,  bold: true },
      { text: "Open the Access Guide below.",                      y: 280, size: 50, color: WHITE, bold: true },
      { text: "Add adam@primelocalgrowth.com as Manager.",         y: 370, size: 26, color: MUTED },
      { text: "Questions? adam@primelocalgrowth.com",              y: 440, size: 22, color: MUTED },
    ],
  },
];

function escapeDrawtext(raw) {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/:/g,  "\\:")
    .replace(/,/g,  "\\,")
    .replace(/%/g,  "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

const clipPaths = [];

for (let si = 0; si < SLIDES.length; si++) {
  const slide = SLIDES[si];
  const clipOut = join(ROOT, `.tmp-slide-${si}.mp4`);
  clipPaths.push(clipOut);

  const drawTexts = slide.lines.map((line) => {
    const font = line.italic ? FONT_ITAL : line.bold ? FONT_BOLD : FONT_REG;
    const txt  = escapeDrawtext(line.text);
    return (
      `drawtext=fontfile='${font}':text='${txt}':` +
      `fontsize=${line.size}:fontcolor=${line.color}:` +
      `x=(w-text_w)/2:y=${line.y}:` +
      `alpha='if(lt(t,0.4),t/0.4,1)'`
    );
  });

  const vf = [
    `drawbox=x=0:y=0:w=iw:h=5:color=${BLUE}@1:t=fill`,
    `drawbox=x=0:y=ih-5:w=iw:h=5:color=${BLUE}@1:t=fill`,
    ...drawTexts,
  ].join(",");

  const args = [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${slide.dur}`,
    "-vf", vf,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "23",
    "-t", String(slide.dur),
    clipOut,
  ];

  console.log(`Rendering slide ${si + 1}/${SLIDES.length}…`);
  const r = spawnSync(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) {
    console.error("stderr:", r.stderr?.toString().slice(-1200));
    process.exit(1);
  }
}

console.log("Concatenating…");
writeFileSync(CONCAT_LIST, clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));

const concat = spawnSync(FFMPEG, [
  "-y", "-f", "concat", "-safe", "0",
  "-i", CONCAT_LIST,
  "-c", "copy",
  OUT,
], { stdio: ["ignore", "pipe", "pipe"] });

if (concat.status !== 0) {
  console.error("concat stderr:", concat.stderr?.toString().slice(-800));
  process.exit(1);
}

clipPaths.forEach((p) => { try { unlinkSync(p); } catch {} });
try { unlinkSync(CONCAT_LIST); } catch {}

const total = SLIDES.reduce((s, sl) => s + sl.dur, 0);
console.log(`\nVideo written to ${OUT}`);
console.log(`Duration: ${total}s | ${W}x${H} | ${FPS}fps`);
