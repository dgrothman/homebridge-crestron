import {CrestronProcessor} from "./crestron-processor";
import {TestLogger} from "./testing/test-logger";

describe('Processor Testing', () => {
  let logger: TestLogger;
  let processor: CrestronProcessor;
  beforeEach(() => {
    logger = new TestLogger('getLights verification');
    // @ts-ignore
    processor = new CrestronProcessor('192.168.0.249',41900,logger,1);
  });
  test('getLights',async () => {
    const lights = await processor.getLights();
    expect(lights.length).toEqual(3);
  });
  test('getShades',async () => {
    const shades = await processor.getShades();
    expect(shades.length).toEqual(4);
  });
  test('sendData loadDim', async () => {
    processor.setWindowPosition(1032,0);
    await setTimeout((id) => {
      const pos = processor.getWindowPosition(id);
    },10000, 1032);
    processor.getWindowPosition(1032);
  })
});


