class PriorityQueue {
  constructor() {
    this._queue = [];
  }
  size() {
    return this._queue.length;
  }
  isEmpty() {
    return this.size() == 0;
  }
  push(point) {
    const [priority,] = point;
    const index = this._queue.findIndex((point) => point[0] >= priority + 1);
    console.log(index);
    if (index === -1) {
      this._queue.push(point);
    } else {
      this._queue.splice(index, 0, point);
    }
  }
  pop() {
    return this._queue.shift();
  }
}

export default PriorityQueue;