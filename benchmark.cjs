// Mock admin
const mockDoc = { set: async () => new Promise(resolve => setTimeout(resolve, 50)) };
const mockDb = {
  doc: () => mockDoc,
  batch: () => {
    let ops = 0;
    return {
      set: () => { ops++; },
      commit: async () => new Promise(resolve => setTimeout(resolve, 50))
    }
  }
};

async function runBenchmark() {
  console.log("Measuring Sequential Set (N=10)");
  let start = Date.now();
  for (let i = 0; i < 10; i++) {
    await mockDb.doc('test').set({ data: 1 });
  }
  console.log("Sequential Set Time:", Date.now() - start, "ms");

  console.log("Measuring Batched Set (N=10)");
  start = Date.now();
  let batch = mockDb.batch();
  for (let i = 0; i < 10; i++) {
    batch.set(mockDb.doc('test'), { data: 1 });
  }
  await batch.commit();
  console.log("Batched Set Time:", Date.now() - start, "ms");
}

runBenchmark();
