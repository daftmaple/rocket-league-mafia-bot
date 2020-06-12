export class CallbackTest {
  private callback: Function | null;
  constructor() {
    this.callback = null;
  }

  setCallback(f: Function) {
    this.callback = f;
  }

  doCallback() {
    if (!this.callback) return;
    this.callback();
    this.callback = null;
  }

  forceCallback() {
    this.doCallback();
  }
}
