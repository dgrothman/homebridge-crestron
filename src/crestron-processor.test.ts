import {CrestronProcessor} from "./crestron-processor";
import {TestLogger} from "./testing/test-logger";

test('getLights',async () => {
  const logger = new TestLogger('getLights verification');
  // @ts-ignore
  const processor = new CrestronProcessor('192.168.0.249',41900,logger,1);
  const lights = await processor.getLights();
  expect(lights.length).toEqual(3);
});
test('getShades',async () => {
  const logger = new TestLogger('getShades verification');
  // @ts-ignore
  const processor = new CrestronProcessor('192.168.0.249',41900,logger,1);
  const shades = await processor.getShades();
  expect(shades.length).toEqual(4);
});
