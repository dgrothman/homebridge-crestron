import {Logging, LogLevel} from "homebridge";

// @ts-ignore
export class TestLogger implements Logging{
  public readonly prefix: string;
  constructor(prefix: string) {
    this.prefix = prefix;
  }

  info(message: string, ...parameters: any[]): void {
    console.info(message, ...parameters);
  }
  warn(message: string, ...parameters: any[]): void {
    console.warn(message, ...parameters);
  }
  error(message: string, ...parameters: any[]): void {
    console.error(message, ...parameters);
  }
  debug(message: string, ...parameters: any[]): void {
    console.debug(message, ...parameters);
  }
  log(level: LogLevel, message: string, ...parameters: any[]): void {
    console.log(message, ...parameters);
  }
}
