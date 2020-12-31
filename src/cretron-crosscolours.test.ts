import {TestLogger} from "./testing/test-logger";
import {CrestronCrosscolours} from "./crestron-crosscolours";
import {mocked} from "ts-jest";

jest.mock('./crestron-crosscolours',() => {
  return {
    CrestronCrosscolours: jest.fn().mockImplementation(() => {
      return {

      };
    })
  }
});

describe('Homebridge plugin test', () => {
  const MockedCrestronCrosscolours = mocked(CrestronCrosscolours, true);

  beforeEach(() => {
    MockedCrestronCrosscolours.mockClear();
  });

  it('discoverDevices check', () => {

  });
});
