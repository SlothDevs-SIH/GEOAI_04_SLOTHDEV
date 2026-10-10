// Eight vertical shorts (about 15 s each, 2 minutes in total), no voice-over: captions only.
// Output: <out>/short-N.webm. Phone layout (540 x 960 viewport, recorded at 1080 x 1920).
import { open, hold } from "./lib.mjs";

const out = process.argv[2] ?? "/tmp/video/shorts";
const only = process.argv[3] ? Number(process.argv[3]) : 0;
const NAMES = {};

async function short(n, title, body) {
  if (only && only !== n) return;
  const v = await open({ width: 540, height: 960, out: `${out}/s${n}`, size: { width: 1080, height: 1920 } });
  await v.goto("");
  await v.page.evaluate(() => { const s = document.documentElement.style; s.setProperty("--cap-size", "25px"); s.setProperty("--h-size", "46px"); s.setProperty("--p-size", "22px"); s.setProperty("--big-size", "92px"); });
  await v.card(title);
  await hold(2600);
  await v.card(null); await hold(500);
  await body(v);
  await v.caption(null);
  await v.card(`<h1>GEOAI <b>04</b></h1><p>Only what really changed.</p>`);
  await hold(1500);
  NAMES[n] = await v.close();
  console.log(n, NAMES[n]);
}
const ready = async (v) => { await v.page.getByTestId("counter").waitFor(); await hold(900); };
const top = (v) => v.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

await short(1, `<p>Satellite change detection</p><div class="big">3,490 → 37</div><p>raw detections → real flood areas</p>`, async (v) => {
  await v.goto("#/scene/assam-flood-2016"); await ready(v);
  await v.caption("Assam flood, 2016. Radar sees through monsoon cloud");
  await hold(3000);
  await v.caption("Filter off: 3,490 detections, mostly noise");
  await v.click('[data-testid="filter-toggle"]'); await hold(3500);
  await v.caption("Filter on: 37 real flood areas");
  await v.click('[data-testid="filter-toggle"]'); await hold(3500);
});

await short(2, `<h1>Floods, <b>through cloud</b></h1><p>Sentinel-1 radar: water is dark</p>`, async (v) => {
  await v.goto("#/scene/assam-flood-2016"); await ready(v);
  const box = await v.page.getByTestId("compare-map").boundingBox();
  await v.caption("Drag to compare before and after");
  await v.dragX('[data-testid="swipe-handle"]', { x: box.x + box.width * 0.15 }, { steps: 40 });
  await v.dragX('[data-testid="swipe-handle"]', { x: box.x + box.width * 0.85 }, { steps: 60 });
  await v.caption("Compare with the expert hand labels");
  await v.click('[data-testid="labels-toggle"]'); await hold(4500);
});

await short(3, `<h1>New construction, <b>ranked</b></h1><p>Navi Mumbai airport build-out</p>`, async (v) => {
  await v.goto("#/scene/navi-mumbai-airport"); await ready(v);
  await v.caption("2,185 raw detections → 265 real changes");
  await hold(3000);
  const box = await v.page.getByTestId("compare-map").boundingBox();
  await v.caption("Swipe: before and after, same place");
  await v.dragX('[data-testid="swipe-handle"]', { x: box.x + box.width * 0.2 }, { steps: 40 });
  await v.dragX('[data-testid="swipe-handle"]', { x: box.x + box.width * 0.8 }, { steps: 60 });
  await hold(1500);
});

await short(4, `<h1>Every change is <b>explained</b></h1><p>Priority, size, confidence, a reason</p>`, async (v) => {
  await v.goto("#/scene/navi-mumbai-airport"); await ready(v);
  await v.caption("Tap a change in the ranked list");
  await v.click('[data-testid="change-row"] >> nth=0'); await hold(1500);
  await v.glide('[data-testid="reason"]');
  await v.caption("A plain-language reason for each one"); await hold(4000);
  await v.caption("Confirm or dismiss: it is remembered");
  await v.click('[data-testid="confirm"]'); await hold(3500);
});

await short(5, `<h1>The <b>honest</b> test</h1><p>Farmland with no new buildings</p>`, async (v) => {
  await v.goto("#/scene/season-control"); await ready(v);
  await v.caption("3,083 raw detections: crops, shadows, lighting");
  await hold(4500);
  await v.caption("22 kept. The filters work");
  await hold(4500);
});

await short(6, `<h1>Not every change is <b>encroachment</b></h1><p>Guwahati, Assam</p>`, async (v) => {
  await v.goto("#/scene/guwahati"); await ready(v);
  await v.caption("A river sandbar moved. That is not a building");
  await hold(4500);
  const box = await v.page.getByTestId("compare-map").boundingBox();
  await v.dragX('[data-testid="swipe-handle"]', { x: box.x + box.width * 0.2 }, { steps: 40 });
  await v.caption("The tool says so instead of raising an alarm");
  await hold(3500);
});

await short(7, `<h1>Live <b>sensitivity lab</b></h1><p>Drag a slider, watch detections change</p>`, async (v) => {
  await v.goto("#/scene/navi-mumbai-airport"); await ready(v);
  const lab = v.page.getByTestId("sensitivity-loading").or(v.page.getByTestId("sensitivity-lab")).first();
  await lab.scrollIntoViewIfNeeded().catch(() => undefined);
  await v.page.getByTestId("lab-count").waitFor({ timeout: 20000 });
  await v.glide('[data-testid="lab-count"]');
  await v.caption("Computed in the browser, no server");
  const s = v.page.getByTestId("lab-threshold"); const sb = await s.boundingBox();
  await v.glide(s); await v.page.mouse.down();
  await v.page.mouse.move(sb.x + sb.width * 0.15, sb.y + sb.height / 2, { steps: 40 }); await hold(1500);
  await v.page.mouse.move(sb.x + sb.width * 0.9, sb.y + sb.height / 2, { steps: 60 }); await hold(1500);
  await v.page.mouse.up();
});

await short(8, `<h1>Numbers you can <b>rerun</b></h1><p>Measured, with 95% intervals</p>`, async (v) => {
  await v.goto("#/accuracy"); await v.page.getByTestId("acc-oscd").waitFor();
  await v.glide('[data-testid="acc-oscd"]');
  await v.caption("Naive 0.24 → rules 0.38 → learned 0.54 F1"); await hold(4500);
  await v.glide('[data-testid="acc-levir"]');
  await v.caption("Published result reproduced: 0.90 on LEVIR-CD"); await hold(4500);
});
