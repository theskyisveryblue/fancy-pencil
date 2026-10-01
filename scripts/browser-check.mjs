import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.PEN_CLONE_URL ?? 'http://127.0.0.1:4173/';
const outDir = process.env.PEN_CLONE_SHOTS ?? join(process.cwd(), 'handoff', 'browser-results');
const executablePath = process.env.PEN_CLONE_CHROME || undefined;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

const result = { url, executablePath: executablePath ?? 'bundled-chromium', startedAt: new Date().toISOString(), ok: false, steps: [] };

function record(name, pass, detail) {
  result.steps.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) });
  if (!pass) throw new Error('browser check step failed: ' + name);
}

mkdirSync(outDir, { recursive: true });

let browser;
try {
  browser = await chromium.launch(executablePath ? { executablePath } : {});
} catch (error) {
  console.log('BROWSER UNAVAILABLE: ' + error.message);
  process.exit(2);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const waitField = async (testId, value) => {
    await page.waitForFunction(([id, expected]) => document.querySelector('[data-testid="' + id + '"]')?.value === expected, [testId, value], { timeout: 5000 });
  };
  const waitSelection = async (id) => {
    await page.waitForFunction(expected => document.querySelector('[data-testid="selection-summary"]')?.textContent === expected, id, { timeout: 5000 });
  };
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="canvas-root"]');
  record('editor loads', true);
  await page.getByRole('button', { name: 'goodies' }).click();
  record('Goodies categories and native card names open', await page.getByTestId('goodies-dialog').isVisible() && await page.getByRole('button', { name: 'Shaders', exact: true }).isVisible() && await page.getByText('Warm Gummy', { exact: true }).isVisible());
  await page.screenshot({ path: join(outDir, 'goodies-gallery.png') });
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: 'Insert to Canvas Clock' }).click();
  await page.getByRole('button', { name: 'goodies' }).click();
  await page.getByRole('button', { name: 'Insert to Canvas Warm Gummy' }).click();
  await page.click('[data-testid="save-file"]');
  const goodieNodes=await page.evaluate(() => { const raw=localStorage.getItem('pen-clone.document.v1'); if(!raw)return []; const walk=nodes=>nodes.flatMap(node=>[node,...walk(node.children||[])]); return walk(JSON.parse(raw).document.children).filter(node=>node.name==='Clock'||node.name==='Warm Gummy'); });
  record('Goodies script and shader save native node shapes', goodieNodes.some(node=>node.type==='script'&&node.scriptUri==='images/clock.js')&&goodieNodes.some(node=>node.type==='frame'&&node.fill?.type==='shader'&&node.fill.url==='images/gummy.glsl'), goodieNodes);

  const nativeGoodies=JSON.parse(readFileSync(join(process.cwd(),'src/ui/goodiesCatalog.json'),'utf8'));
  for(const [name,template] of Object.entries(nativeGoodies)) {
    if(name==='Clock'||name==='Warm Gummy')continue;
    await page.getByRole('button', { name: 'goodies' }).click();
    await page.getByRole('button', { name: template.type==='script'?'Scripts':'Shaders', exact: true }).click();
    await page.getByRole('button', { name: 'Insert to Canvas '+name }).click();
  }
  await page.click('[data-testid="save-file"]');
  const allGoodies=await page.evaluate(() => { const raw=localStorage.getItem('pen-clone.document.v1');if(!raw)return [];const walk=nodes=>nodes.flatMap(node=>[node,...walk(node.children||[])]);return walk(JSON.parse(raw).document.children); });
  const unmatched=Object.entries(nativeGoodies).filter(([name,template])=>!allGoodies.some(node=>node.name===name&&Object.entries(template).every(([key,value])=>JSON.stringify(node[key])===JSON.stringify(value))));
  record('all 23 Goodies node templates match captured native saves', unmatched.length===0, {count:Object.keys(nativeGoodies).length,unmatched:unmatched.map(([name])=>name),actualNames:allGoodies.map(node=>node.name)});
  const previewCounts={scripts:await page.locator('.node-script-preview').count(),shaders:await page.locator('.node-frame[style*="shader-"]').count()};
  record('all Goodies canvas previews render',previewCounts.scripts===10&&previewCounts.shaders===13,previewCounts);
  await page.getByRole('button', { name: 'goodies' }).click();
  await page.getByRole('button', { name: 'Styles', exact: true }).click();
  await page.getByRole('button', { name: 'Copy to Agent Zigzag Bold Split - Forest Sage' }).click();
  await page.getByTestId('agent-panel').waitFor();
  record('Goodies style attaches Agent context chip',await page.locator('.agent-context-chip').filter({hasText:'Zigzag Bold Split - Forest Sage'}).isVisible()&&await page.getByTestId('agent-panel').isVisible());
  await page.getByRole('button',{name:'Add to context'}).click();
  record('Agent context menu matches native choices',await page.getByRole('button',{name:'Choose a style'}).isVisible());
  await page.getByRole('button',{name:'Parallel agents'}).click();
  record('Agent parallel menu includes six agents',await page.getByRole('button',{name:'6x',exact:true}).isVisible());
  await page.getByRole('button',{name:'Claude Opus 5.5'}).click();
  await page.getByRole('button',{name:'GPT 6 Astra'}).click();
  await page.getByRole('textbox',{name:'Design anything'}).fill('Design audit card');
  await page.getByRole('button',{name:'Send message'}).click();
  record('Agent composer queues message locally',await page.getByText('Design audit card').isVisible()&&await page.getByText('Waiting for OpenEditor').isVisible());
  await page.getByRole('button', { name: 'goodies' }).click();
  await page.getByRole('button', { name: 'Design Systems', exact: true }).click();
  await page.getByRole('button', { name: 'Open Document Shadcn UI' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="file-name"]')?.textContent==='Shadcn UI.pen');
  record('Goodies opens bundled design system document', await page.locator('[data-node-id]').count()>0);



  const fontInfo = await page.evaluate(async () => {
    await document.fonts.load('600 24px Inter');
    const faces = Array.from(document.fonts).filter((face) => String(face.family).replace(/["']/g, '') === 'Inter');
    const loaded600 = faces.filter((face) => String(face.weight) === '600' && face.status === 'loaded');
    return {
      count: faces.length,
      loaded600: loaded600.length,
      weights: Array.from(new Set(faces.map((face) => String(face.weight)))).sort(),
      ready: document.fonts.check('600 24px Inter'),
    };
  });
  record(
    'bundled Inter 600 FontFace objects load locally',
    fontInfo.count > 0 && fontInfo.loaded600 > 0 && fontInfo.ready === true,
    fontInfo,
  );

  await page.click('[data-testid="open-file-menu"]');
  await page.waitForSelector('[data-testid="node-JLb0R"]', { timeout: 10000 });
  record('audit fixture opens with the nested frame', true, { nodes: await page.locator('[data-node-id]').count() });
  await page.getByTestId('tab-layers').click();

  // Native Create Component: the saved JSON adds only reusable:true to JLb0R.
  const expandAuditRoot = async () => { const toggle = page.locator('[data-testid="layer-toggle-bi8Au"]'); if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click(); };
  await expandAuditRoot();
  await page.click('[data-testid="layer-JLb0R"]');
  await waitSelection('JLb0R');
  record('Create Component enabled for a non-reusable frame', await page.isEnabled('[data-testid="create-component"]'));
  await page.click('[data-testid="create-component"]');
  record('Create Component disabled after creation', !(await page.isEnabled('[data-testid="create-component"]')));
  await page.click('[data-testid="save-file"]');
  const createdSaved = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pen-clone.document.v1');
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const find = (nodes) => {
      for (const node of nodes) {
        if (node.id === 'JLb0R') return node;
        const child = find(node.children ?? []);
        if (child) return child;
      }
      return null;
    };
    return find(stored.document.children);
  });
  record('saved component keeps frame id and children', createdSaved?.reusable === true && createdSaved.id === 'JLb0R' && createdSaved.children?.length === 5);
  await page.reload({ waitUntil: 'load' });
  await expandAuditRoot();
  await page.click('[data-testid="layer-JLb0R"]');
  record('created component persists after reload', !(await page.isEnabled('[data-testid="create-component"]')));
  await page.click('[data-testid="open-file-menu"]');
  await page.waitForSelector('[data-testid="node-JLb0R"]');

  // Native Components sidebar drag appends a compact top-level ref to JLb0R.
  await expandAuditRoot();
  await page.click('[data-testid="layer-JLb0R"]');
  await page.click('[data-testid="create-component"]');
  await page.click('[data-testid="tab-components"]');
  const card = page.locator('[data-testid="component-card-JLb0R"]');
  record('created origin appears as draggable component card', await card.count() === 1 && await card.getAttribute('draggable') === 'true');
  await card.dragTo(page.locator('[data-testid="canvas-root"]'), { targetPosition: { x: 500, y: 750 } });
  await page.click('[data-testid="save-file"]');
  const inserted = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pen-clone.document.v1');
    if (!raw) return null;
    const stored = JSON.parse(raw);
    return stored.document.children.find((node) => node.type === 'ref' && node.ref === 'JLb0R') ?? null;
  });
  record('drag persists one compact top-level ref', !!inserted && typeof inserted.id === 'string' && inserted.id.length === 5
    && Number.isFinite(inserted.x) && Number.isFinite(inserted.y) && !('children' in inserted) && !('reusable' in inserted), inserted);
  await page.screenshot({ path: join(outDir, 'component-insert.png') });
  await page.keyboard.press(mod + '+z');
  record('component insertion undo removes only the new instance',
    await page.locator('[data-testid="node-' + inserted.id + '"]').count() === 0
      && await page.locator('[data-testid="node-JLb0R"]').count() === 1);
  await page.keyboard.press(mod + '+Shift+z');
  record('component insertion redo restores the same ref id',
    await page.locator('[data-testid="node-' + inserted.id + '"]').count() === 1);
  await page.click('[data-testid="save-file"]');
  await page.reload({ waitUntil: 'load' });
  record('inserted ref survives save and reload', await page.locator('[data-testid="node-' + inserted.id + '"]').count() === 1);

  // Native free-layout drop appends a ref child with parent-local x/y.
  await page.click('[data-testid="tab-components"]');
  await page.locator('[data-testid="component-card-JLb0R"]').dragTo(page.locator('[data-testid="node-bi8Au"]'), { targetPosition: { x: 760, y: 550 } });
  await page.click('[data-testid="save-file"]');
  const nestedRef = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem('pen-clone.document.v1'));
    return stored.document.children.find((node) => node.id === 'bi8Au')?.children?.at(-1) ?? null;
  });
  record('drag inside free-layout frame persists local x/y ref', nestedRef?.type === 'ref' && nestedRef.ref === 'JLb0R'
    && Number.isFinite(nestedRef.x) && Number.isFinite(nestedRef.y)
    && Object.keys(nestedRef).sort().join(',') === 'id,ref,type,x,y', nestedRef);

  // Native vertical auto-layout drop appends a ref without x/y.
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.locator('[data-testid="component-card-JLb0R"]').dragTo(page.locator('[data-testid="node-ptlRG"]'), { targetPosition: { x: 80, y: 250 } });
  await page.click('[data-testid="save-file"]');
  const autoRef = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem('pen-clone.document.v1'));
    return stored.document.children.find((node) => node.id === 'ptlRG')?.children?.at(-1) ?? null;
  });
  record('drag inside auto-layout frame persists flow ref without x/y', autoRef?.type === 'ref' && autoRef.ref === 'JLb0R'
    && Object.keys(autoRef).sort().join(',') === 'id,ref,type', autoRef);
  await page.screenshot({ path: join(outDir, 'component-nested-insert.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('[data-testid="open-file-menu"]');
  await page.waitForSelector('[data-testid="node-JLb0R"]');
  await page.click('[data-testid="tab-layers"]');

  record('ref instance renders from its origin', (await page.locator('[data-testid="node-x7eMPw"]').count()) === 1);
  record('reusable origin renders too', (await page.locator('[data-testid="node-Iy7jv"]').count()) === 1);

  await page.screenshot({ path: join(outDir, '01-fixture.png') });

  const box = await page.locator('[data-testid="canvas-root"]').boundingBox();
  if (!box) throw new Error('canvas bounding box unavailable');
  const stage = await page.locator('.canvas-stage').boundingBox();
  if (!stage) throw new Error('canvas stage bounding box unavailable');
  const stageX = stage.x;
  const stageY = stage.y;

  const layerPanel = await page.locator('.layer-panel').boundingBox();
  if (!layerPanel) throw new Error('layer panel bounding box unavailable');
  const dragStartX = Math.round(stageX + 100);
  const dragStartY = Math.round(stageY + 80);
  const dragEndX = Math.round(layerPanel.x + layerPanel.width / 2);
  const dragEndY = Math.round(layerPanel.y + layerPanel.height / 2);
  const capturedExpectedX = String(32 + Math.round(dragEndX - dragStartX));
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragEndX, dragEndY, { steps: 8 });
  await page.mouse.up();
  await waitField('prop-x', capturedExpectedX);
  const capturedX = await page.inputValue('[data-testid="prop-x"]');
  record('drag that leaves the viewport commits through pointer capture', capturedX === capturedExpectedX, {
    propX: capturedX,
    expected: capturedExpectedX,
  });
  await page.keyboard.press(mod + '+z');
  await waitField('prop-x', '32');
  const captureUndoX = await page.inputValue('[data-testid="prop-x"]');
  record('undo restores the fixture after the captured drag', captureUndoX === '32', { propX: captureUndoX });

  await page.mouse.move(stageX + 100, stageY + 80);
  await page.mouse.down();
  await page.mouse.up();
  await waitSelection('JLb0R');
  const selected = await page.textContent('[data-testid="selection-summary"]');
  record('single click selects the containing frame', selected === 'JLb0R', { selected });

  await page.mouse.move(stageX + 100, stageY + 80);
  await page.mouse.down();
  await page.mouse.move(stageX + 110, stageY + 90, { steps: 4 });
  await page.mouse.up();
  await waitField('prop-x', '42');
  const movedX = await page.inputValue('[data-testid="prop-x"]');
  record('pointer drag moves the selected frame', movedX === '42', { propX: movedX });

  await page.keyboard.press(mod + '+z');
  await waitField('prop-x', '32');
  const undoneX = await page.inputValue('[data-testid="prop-x"]');
  record('keyboard undo restores x', undoneX === '32', { propX: undoneX });

  await page.keyboard.press(mod + '+Shift+z');
  await waitField('prop-x', '42');
  const redoneX = await page.inputValue('[data-testid="prop-x"]');
  record('keyboard redo reapplies x', redoneX === '42', { propX: redoneX });

  await page.mouse.dblclick(stageX + 100, stageY + 80);
  await waitSelection('LvT0V');
  const deep = await page.textContent('[data-testid="selection-summary"]');
  record('double click deep selects the child', deep === 'LvT0V', { selected: deep });

  const handle = page.locator('[data-handle="se"]');
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('resize handle bounding box unavailable');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 20, handleBox.y + handleBox.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await waitField('prop-w', '612');
  await waitField('prop-h', '100');
  const resizedW = await page.inputValue('[data-testid="prop-w"]');
  const resizedH = await page.inputValue('[data-testid="prop-h"]');
  record('pointer resize updates width and height', resizedW === '612' && resizedH === '100', { width: resizedW, height: resizedH });

  await page.fill('[data-testid="prop-w"]', '500');
  await page.locator('[data-testid="prop-w"]').press('Enter');
  await page.locator('[data-testid="prop-w"]').blur();
  await waitField('prop-w', '500');
  const typedW = await page.inputValue('[data-testid="prop-w"]');
  record('property panel edit commits', typedW === '500', { width: typedW });

  const asHex = (value) => (typeof value === 'string' ? value.toLowerCase() : value);
  const hexToRgb = (hex) => {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex ?? '');
    if (!match) return null;
    const triple = match[1];
    return 'rgb(' + parseInt(triple.slice(0, 2), 16) + ', ' + parseInt(triple.slice(2, 4), 16) + ', ' + parseInt(triple.slice(4, 6), 16) + ')';
  };

  const fillRaw = await page.inputValue('[data-testid="prop-fill"]');
  const swatchResolved = await page.getAttribute('[data-testid="prop-fill-swatch"]', 'data-resolved-color');
  const swatchBackground = await page.locator('[data-testid="prop-fill-swatch"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const canvasFill = await page.getAttribute('[data-testid="node-LvT0V"]', 'data-fill');
  record('fill field keeps the raw $audit-accent variable reference', fillRaw === '$audit-accent', { fillRaw });
  record(
    'fill swatch resolves and matches the canvas rectangle',
    swatchResolved === '#7C3AED' && swatchResolved === canvasFill && swatchBackground === hexToRgb(canvasFill),
    { swatchResolved, canvasFill, swatchBackground },
  );

  await page.mouse.move(stageX + 100, stageY + 80);
  await page.mouse.down();
  await page.mouse.up();
  await waitSelection('JLb0R');
  await waitField('prop-fill', '$audit-surface');
  const lightRawFill = await page.inputValue('[data-testid="prop-fill"]');
  const lightSwatch = await page.getAttribute('[data-testid="prop-fill-swatch"]', 'data-resolved-color');
  const lightPicker = await page.inputValue('[data-testid="prop-fill-picker"]');
  const lightCanvasFill = await page.getAttribute('[data-testid="node-JLb0R"]', 'data-fill');
  await page.click('[data-testid="theme-dark"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="prop-fill-swatch"]')?.getAttribute('data-resolved-color') === '#0F172A',
    undefined,
    { timeout: 5000 },
  );
  const darkRawFill = await page.inputValue('[data-testid="prop-fill"]');
  const darkSwatch = await page.getAttribute('[data-testid="prop-fill-swatch"]', 'data-resolved-color');
  const darkPicker = await page.inputValue('[data-testid="prop-fill-picker"]');
  const darkCanvasFill = await page.getAttribute('[data-testid="node-JLb0R"]', 'data-fill');
  record(
    'themed swatch and native picker follow the canvas while the reference is preserved',
    lightRawFill === '$audit-surface' && darkRawFill === '$audit-surface'
      && lightSwatch === '#F8FAFC' && lightCanvasFill === '#F8FAFC' && asHex(lightPicker) === '#f8fafc'
      && darkSwatch === '#0F172A' && darkCanvasFill === '#0F172A' && asHex(darkPicker) === '#0f172a',
    { lightSwatch, lightPicker, lightCanvasFill, darkSwatch, darkPicker, darkCanvasFill, lightRawFill, darkRawFill },
  );
  await page.click('[data-testid="theme-light"]');

  const componentInsets = await page.evaluate(() => {
    const inset = (parentId, childId) => {
      const parent = document.querySelector('[data-node-id="' + parentId + '"]');
      const child = document.querySelector('[data-node-id="' + childId + '"]');
      if (!parent || !child) return null;
      const p = parent.getBoundingClientRect();
      const c = child.getBoundingClientRect();
      return { x: c.left - p.left, y: c.top - p.top, cssX: child.style.left, cssY: child.style.top };
    };
    return { origin: inset('Iy7jv', 'yyyuL'), instance: inset('x7eMPw', 'x7eMPw/yyyuL') };
  });
  for (const [kind, inset] of Object.entries(componentInsets)) {
    record(kind + ' label DOM geometry respects omitted horizontal layout and 12px padding',
      inset !== null && Math.abs(inset.x - 12) < 0.1 && Math.abs(inset.y - 12) < 0.1
        && inset.cssX === '12px' && inset.cssY === '12px', inset);
  }

  await page.screenshot({ path: join(outDir, '02-after-edits.png') });

  const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('[data-testid="save-file"]');
  const download = await downloadPromise;
  record('save triggers a .pen download', Boolean(download), { suggestedFilename: download ? download.suggestedFilename() : null });

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pen-clone.document.v1');
    return raw ? raw.length : 0;
  });
  record('save writes the document to localStorage', stored > 0, { bytes: stored });

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="node-JLb0R"]', { timeout: 10000 });
  const reloadedX = await page.getAttribute('[data-testid="node-JLb0R"]', 'data-abs-x');
  record('reload restores the persisted document', reloadedX === '42', { absX: reloadedX });

  await page.screenshot({ path: join(outDir, '03-after-reload.png') });

  // Fit-content projection: open the owned fit fixture, confirm the model and
  // the rendered DOM agree on the fitted width and child positions, then save
  // and reload to prove raw sizing strings survive the round trip.
  await page.setInputFiles('[data-testid="open-file-input"]', join(process.cwd(), 'public', 'fit-content-fixture.pen'));
  await page.waitForSelector('[data-testid="node-fxRow"]', { timeout: 10000 });
  const fitRowBox = await page.locator('[data-testid="node-fxRow"]').boundingBox();
  const fitChildB = await page.locator('[data-testid="node-fxChildB"]').boundingBox();
  const fitAbsBox = await page.locator('[data-testid="node-fxAbsolute"]').boundingBox();
  if (!fitRowBox || !fitChildB || !fitAbsBox) throw new Error('fit fixture DOM geometry unavailable');
  record(
    'fit-content horizontal frame grows to children (model 176 DOM 176)',
    Math.abs(fitRowBox.width - 176) < 0.5 && Math.abs(fitChildB.x - fitRowBox.x - 118) < 0.5,
    { domWidth: fitRowBox.width, childDX: fitChildB.x - fitRowBox.x },
  );
  record(
    'fit-content excludes the absolute child and keeps its own position',
    Math.abs(fitAbsBox.x - fitRowBox.x - 300) < 0.5,
    { absDX: fitAbsBox.x - fitRowBox.x, domWidth: fitRowBox.width },
  );
  const fitColBox = await page.locator('[data-testid="node-fxCol"]').boundingBox();
  if (!fitColBox) throw new Error('fit vertical frame DOM geometry unavailable');
  record('fit-content vertical frame takes the widest child plus padding (144)', Math.abs(fitColBox.width - 144) < 0.5, { domWidth: fitColBox.width });

  await page.click('[data-testid="save-file"]');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="node-fxRow"]', { timeout: 10000 });
  const fitRawWidth = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pen-clone.document.v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const row = (parsed.document.children || []).find((node) => node.id === 'fxRow');
    return row ? row.width ?? null : '<missing>';
  });
  record(
    'the fit fixture keeps the raw fit_content width string through save and reload',
    fitRawWidth === 'fit_content',
    { rawWidth: fitRawWidth },
  );

  // Restore the normal audit fixture so any later step sees the original doc.
  await page.click('[data-testid="open-file-menu"]');
  await page.waitForSelector('[data-testid="node-JLb0R"]', { timeout: 10000 });
  record('audit fixture restored after the fit-content check', (await page.locator('[data-testid="node-JLb0R"]').count()) === 1);

  // Native Pen api-nested-components: the origin keeps its content while the
  // instance ref projects two stable source-id descendant overrides.
  await page.setInputFiles('[data-testid="open-file-input"]', join(process.cwd(), 'public', 'nested-overrides-fixture.pen'));
  await page.waitForSelector('[data-testid="node-G3F0DE/c4zmg/GigZ5"]', { timeout: 10000 });
  const originTitle = await page.locator('[data-testid="node-veExn"]').textContent();
  const originInner = await page.locator('[data-testid="node-GigZ5"]').textContent();
  const instanceTitle = await page.locator('[data-testid="node-G3F0DE/veExn"]').textContent();
  const instanceInner = await page.locator('[data-testid="node-G3F0DE/c4zmg/GigZ5"]').textContent();
  const originColor = await page.getAttribute('[data-testid="node-GigZ5"]', 'data-fill');
  const instanceColor = await page.getAttribute('[data-testid="node-G3F0DE/c4zmg/GigZ5"]', 'data-fill');
  record('native component origins keep their own labels in the DOM',
    originTitle === 'Original outer' && originInner === 'Changed origin', { originTitle, originInner });
  record('nested ref descendants project the native overridden labels',
    instanceTitle === 'Overridden outer' && instanceInner === 'Overridden inner', { instanceTitle, instanceInner });
  record('nested ref fill override is isolated from its origin',
    originColor === '#111827' && instanceColor === '#7C3AED', { originColor, instanceColor });

  await page.click('[data-testid="save-file"]');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="node-G3F0DE/c4zmg/GigZ5"]', { timeout: 10000 });
  const restoredNested = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pen-clone.document.v1');
    if (!raw) return null;
    const stored = JSON.parse(raw);
    return stored.document.children.find((node) => node.id === 'G3F0DE')?.descendants ?? null;
  });
  record('save and reload preserve native raw descendant paths',
    restoredNested?.veExn?.content === 'Overridden outer'
      && restoredNested?.['c4zmg/GigZ5']?.content === 'Overridden inner'
      && restoredNested?.['c4zmg/GigZ5']?.fill === '#7C3AED', restoredNested);
  await page.click('[data-testid="open-file-menu"]');
  await page.waitForSelector('[data-testid="node-JLb0R"]', { timeout: 10000 });

  // Native Pen api-component-replacement + native-component-detach: the instance
  // swaps a complete `type` subtree (D4328u) and replaces the nested ref child
  // list (x8HgK/mNOal) while both origins stay original.
  await page.setInputFiles('[data-testid="open-file-input"]', join(process.cwd(), 'public', 'component-replacement-fixture.pen'));
  await page.waitForSelector('[data-testid="node-D4328u"]', { timeout: 10000 });
  const replacedTitle = await page.locator('[data-testid="node-D4328u"]').textContent();
  const replacedFill = await page.getAttribute('[data-testid="node-D4328u"]', 'data-fill');
  const slotChild = await page.locator('[data-testid="node-mNOal"]').textContent();
  const replacedFrameFill = await page.getAttribute('[data-testid="node-x8HgK"]', 'data-fill');
  const originTitleAfter = await page.locator('[data-testid="node-veExn"]').textContent();
  const originInnerAfter = await page.locator('[data-testid="node-GigZ5"]').textContent();
  record('replacement fixture swaps in the red replacement title',
    replacedTitle === 'Replacement title' && replacedFill === '#DC2626', { replacedTitle, replacedFill });
  record('replacement fixture replaces the nested ref child list',
    slotChild === 'Slot child' && replacedFrameFill === '#FDE68A'
      && (await page.locator('[data-testid="node-G3F0DE/c4zmg/GigZ5"]').count()) === 0
      && (await page.locator('[data-testid="node-G3F0DE/veExn"]').count()) === 0,
    { slotChild, replacedFrameFill });
  record('replacement fixture keeps both origins original',
    originTitleAfter === 'Original outer' && originInnerAfter === 'Changed origin', { originTitleAfter, originInnerAfter });

  await page.click('[data-testid="save-file"]');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="node-D4328u"]', { timeout: 10000 });
  const restoredReplacement = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pen-clone.document.v1');
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const instance = stored.document.children.find((node) => node.id === 'G3F0DE');
    return instance ? instance.descendants ?? null : null;
  });
  record('save and reload preserve the raw replacement forms',
    restoredReplacement?.veExn?.type === 'text' && restoredReplacement?.veExn?.id === 'D4328u'
      && restoredReplacement?.c4zmg?.children?.[0]?.id === 'x8HgK'
      && restoredReplacement?.c4zmg?.children?.[0]?.children?.[0]?.id === 'mNOal', restoredReplacement);

  // Native Pen native-component-detach: select the persisted ref G3F0DE and press
  // Command-Option-X. Native saved a plain frame with the SAME id (the replacement
  // title D4328u and a preserved nested ref -> skSG2 carrying the literal
  // replacement children x8HgK/mNOal) while both source components stayed original.
  await page.click('[data-testid="layer-G3F0DE"]');
  await waitSelection('G3F0DE');
  record('detach button is enabled for a selected persisted ref',
    (await page.isEnabled('[data-testid="detach-instance"]')) === true);
  await page.click('[data-testid="detach-instance"]');
  await waitSelection('G3F0DE');
  const detachedClass = await page.getAttribute('[data-testid="node-G3F0DE"]', 'class');
  const detachedTitle = await page.locator('[data-testid="node-D4328u"]').textContent();
  const detachedTitleFill = await page.getAttribute('[data-testid="node-D4328u"]', 'data-fill');
  const detachedSlot = await page.locator('[data-testid="node-mNOal"]').textContent();
  const detachedFrameFill = await page.getAttribute('[data-testid="node-x8HgK"]', 'data-fill');
  record('detach materializes the replacement title and nested replacement subtree',
    detachedClass?.includes('node-frame') === true
      && detachedTitle === 'Replacement title' && detachedTitleFill === '#DC2626'
      && detachedSlot === 'Slot child' && detachedFrameFill === '#FDE68A'
      && (await page.locator('[data-testid="node-G3F0DE/veExn"]').count()) === 0
      && (await page.locator('[data-testid="node-G3F0DE/c4zmg/GigZ5"]').count()) === 0,
    { detachedClass, detachedTitle, detachedTitleFill, detachedSlot, detachedFrameFill });

  const originTitleDetached = await page.locator('[data-testid="node-veExn"]').textContent();
  const originInnerDetached = await page.locator('[data-testid="node-GigZ5"]').textContent();
  record('detach keeps both source components unchanged',
    originTitleDetached === 'Original outer' && originInnerDetached === 'Changed origin',
    { originTitleDetached, originInnerDetached });

  await page.keyboard.press(mod + '+z');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="node-G3F0DE"]')?.getAttribute('class')?.includes('node-ref') === true,
    undefined,
    { timeout: 5000 },
  );
  record('undo restores the raw ref after detach', true);
  await page.keyboard.press(mod + '+Shift+z');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="node-G3F0DE"]')?.getAttribute('class')?.includes('node-frame') === true,
    undefined,
    { timeout: 5000 },
  );
  record('redo re-materializes the detached frame', true);

  await page.click('[data-testid="save-file"]');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="node-D4328u"]', { timeout: 10000 });
  const savedDetached = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pen-clone.document.v1');
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const frame = stored.document.children.find((node) => node.id === 'G3F0DE');
    if (!frame) return null;
    const nested = Array.isArray(frame.children) ? frame.children.find((node) => node.type === 'ref') : null;
    const ids = [];
    const walk = (node) => {
      ids.push(node.id);
      (node.children || []).forEach(walk);
    };
    (stored.document.children || []).forEach(walk);
    return {
      type: frame.type,
      hasRef: Object.prototype.hasOwnProperty.call(frame, 'ref'),
      hasDescendants: Object.prototype.hasOwnProperty.call(frame, 'descendants'),
      hasReusable: Object.prototype.hasOwnProperty.call(frame, 'reusable'),
      title: frame.children && frame.children[0] ? frame.children[0].content : null,
      nestedRef: nested ? nested.ref : null,
      nestedChild: nested && nested.children && nested.children[0] ? nested.children[0].id : null,
      nestedGrandchild:
        nested && nested.children && nested.children[0] && nested.children[0].children && nested.children[0].children[0]
          ? nested.children[0].children[0].id
          : null,
      unique: new Set(ids).size === ids.length,
      slashed: ids.some((id) => id.includes('/')),
    };
  });
  record('save and reload persist the detached raw frame with unique slash-free ids',
    savedDetached?.type === 'frame'
      && savedDetached?.hasRef === false && savedDetached?.hasDescendants === false && savedDetached?.hasReusable === false
      && savedDetached?.title === 'Replacement title'
      && savedDetached?.nestedRef === 'skSG2' && savedDetached?.nestedChild === 'x8HgK'
      && savedDetached?.nestedGrandchild === 'mNOal'
      && savedDetached?.unique === true && savedDetached?.slashed === false, savedDetached);
  await page.click('[data-testid="open-file-menu"]');
  await page.waitForSelector('[data-testid="node-JLb0R"]', { timeout: 10000 });

  record('no page errors', consoleErrors.length === 0, { consoleErrors });

  result.ok = true;
  writeFileSync(join(outDir, 'browser-result.json'), JSON.stringify(result, null, 2));
  console.log('BROWSER CHECK OK -> ' + join(outDir, 'browser-result.json'));
  await browser.close();
  process.exit(0);
} catch (error) {
  result.error = error.message;
  writeFileSync(join(outDir, 'browser-result.json'), JSON.stringify(result, null, 2));
  console.error('BROWSER CHECK FAILED: ' + error.message);
  await browser.close();
  process.exit(1);
}
