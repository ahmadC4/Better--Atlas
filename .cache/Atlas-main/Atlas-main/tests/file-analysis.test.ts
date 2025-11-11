import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('initOCRWorker loads tessdata from the local filesystem', async (t) => {
  const workerStub = { recognize: mock.fn(async () => ({ data: { text: '' } })) };
  const createWorkerMock = mock.fn(async () => workerStub);

  const baseModuleUrl = new URL('../server/file-analysis.ts', import.meta.url);
  const moduleUrl = new URL(baseModuleUrl.href);
  moduleUrl.searchParams.set('langPathTest', Date.now().toString());

  const {
    FileAnalysisService,
    setCreateWorkerFactory,
    resetCreateWorkerFactory,
  } = await import(moduleUrl.href);
  const service = new FileAnalysisService();

  setCreateWorkerFactory(createWorkerMock as any);

  t.after(() => {
    resetCreateWorkerFactory();
    mock.restoreAll();
  });

  await (service as any).initOCRWorker();

  assert.equal(createWorkerMock.mock.calls.length, 1);
  const [lang, oem, options] = createWorkerMock.mock.calls[0].arguments;
  assert.equal(lang, 'eng');
  assert.equal(oem, 1);
  assert.ok(options && typeof options === 'object', 'worker should receive options');

  const expectedTessdataDir = path.resolve(
    path.dirname(fileURLToPath(baseModuleUrl)),
    'tessdata',
  );

  assert.equal(options.langPath, expectedTessdataDir);

  const trainedDataStat = await fs.stat(path.join(expectedTessdataDir, 'eng.traineddata'));
  assert.equal(trainedDataStat.isFile(), true);
});
