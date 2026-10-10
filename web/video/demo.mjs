// 3-minute landscape demo, no voice-over: on-screen captions only. Output: <out>/demo.webm
import { open, hold } from "./lib.mjs";

const out = process.argv[2] ?? "/tmp/video/demo";
const v = await open({ width: 1600, height: 900, out });
const { page } = v;

// 0:00 title card
await v.goto("");
await v.card(`<h1>GEOAI <b>04</b></h1><p>See what really changed, not every pixel that moved.</p><p style="font-size:20px;color:#8FA3B8">Satellite change detection with the false alarms filtered out · Team Slothdevs</p>`);
await hold(6500);
await v.card(null); await hold(700);

// 0:07 home: the scenes
await v.caption("Nine real places across India, each with a before and an after satellite image");
await hold(2500);
await v.scroll(420, 1800);
await v.glide('[data-testid="scene-card"] >> nth=1');
await hold(1500);
await v.scroll(0, 1200);
await v.caption(null);

// 0:20 flood scene (radar)
await v.click('[data-testid="scene-card"]:has-text("Assam flood")');
await page.getByTestId("counter").waitFor();
await v.caption("Assam, 2016: a monsoon flood, mapped through cloud with Sentinel-1 radar");
await hold(3500);
await v.caption("Drag the divider: before on the left, after on the right");
const box = await page.getByTestId("compare-map").boundingBox();
await v.dragX('[data-testid="swipe-handle"]', { x: box.x + box.width * 0.18 }, { steps: 50 });
await hold(500);
await v.dragX('[data-testid="swipe-handle"]', { x: box.x + box.width * 0.82 }, { steps: 70 });
await hold(800);
await v.caption("Filter off: 3,490 raw detections. Radar speckle, shadows and rivers all look like change");
await v.click('[data-testid="filter-toggle"]');
await hold(4500);
await v.caption("Filter on: 37 real flood areas");
await v.click('[data-testid="filter-toggle"]');
await hold(4500);
await v.caption("Turn on the expert hand labels to compare against the truth");
await v.click('[data-testid="labels-toggle"]');
await hold(4000);
await v.click('[data-testid="labels-toggle"]');
await v.caption(null);

// 1:00 encroachment scene
await v.goto("#/scene/navi-mumbai-airport");
await page.getByTestId("counter").waitFor();
await v.caption("Navi Mumbai airport: a large build-out, 2,185 raw detections down to 265 real changes");
await hold(4500);
await v.caption("Every real change is ranked: critical, high, medium, low, each with its own shape");
await v.glide('[data-testid="change-row"] >> nth=0');
await hold(1800);
await v.click('[data-testid="change-row"] >> nth=0');
await v.caption("Pick one: its size, confidence, and a plain-language reason");
await hold(5000);
await v.click('[data-testid="change-row"] >> nth=2');
await hold(3000);
await v.caption("A reviewer confirms or dismisses each one, and it is remembered");
await v.click('[data-testid="confirm"]');
await hold(3500);
await v.caption("Impact: area changed, cropland and built-up land affected");
await v.glide('[data-testid="impact"]');
await hold(4500);
await v.caption(null);

// 1:40 false-alarm control + regional
await v.goto("#/scene/season-control");
await page.getByTestId("counter").waitFor();
await v.caption("The honest test: farmland with no new buildings. 3,083 raw detections, 22 kept");
await hold(5500);
await v.goto("#/scene/guwahati");
await page.getByTestId("counter").waitFor();
await v.caption("Guwahati: a river sandbar moved. The tool says so instead of calling it encroachment");
await hold(5500);
await v.caption(null);

// 2:00 sensitivity lab
await v.goto("#/scene/navi-mumbai-airport");
await page.getByTestId("counter").waitFor();
await page.getByTestId("sensitivity-loading").or(page.getByTestId("sensitivity-lab")).first().scrollIntoViewIfNeeded().catch(() => undefined);
await page.getByTestId("lab-count").waitFor({ timeout: 20000 });
await v.caption("Sensitivity lab: drag the threshold and watch detections appear and vanish, live in the browser");
await hold(2500);
const slider = page.getByTestId("lab-threshold");
const sb = await slider.boundingBox();
await v.glide(slider);
await page.mouse.down();
await page.mouse.move(sb.x + sb.width * 0.2, sb.y + sb.height / 2, { steps: 40 });
await hold(1500);
await page.mouse.move(sb.x + sb.width * 0.85, sb.y + sb.height / 2, { steps: 60 });
await hold(1800);
await page.mouse.up();
await v.click('[data-testid="lab-reset"]');
await hold(1500);
await v.caption(null);

// 2:20 accuracy
await v.goto("#/accuracy");
await page.getByTestId("acc-oscd").waitFor();
await v.caption("Every number comes from a script anyone can rerun, with 95% intervals");
await hold(4000);
await v.glide('[data-testid="acc-oscd"]');
await v.caption("Naive 0.24, rule-based 0.38, learned model 0.54 F1 on held-out cities");
await hold(5000);
await v.glide('[data-testid="acc-levir"]');
await v.caption("High-resolution mode reproduces the published result: F1 0.90 on LEVIR-CD");
await hold(4500);
await v.glide('[data-testid="acc-not-measured"]');
await v.caption("And it says plainly what is not measured yet");
await hold(4500);
await v.caption(null);

// 2:48 offline + outro
await v.goto("#/scene/pune-hinjewadi");
await page.getByTestId("counter").waitFor();
await v.caption("Save a scene for offline use. The first visit downloads under 5 MB");
await v.click('[data-testid="save-offline"]');
await hold(5000);
await v.caption(null);
await v.card(`<h1>Not every pixel that moved.<br><b>Only what really changed.</b></h1><p>Floods, encroachment and new construction, ranked, explained and ready for GIS.</p><p style="font-size:20px;color:#8FA3B8">GEOAI 04 · Team Slothdevs</p>`);
await hold(6000);
console.log(await v.close());
