/** Test for processing of `diffkemp-out.yaml` file. */
import { expect, test } from "vitest";
import { Differences, DiffKempOutputFormat } from "../src/differences.js";

const EXAMPLE_FOR_FUNCTIONS: DiffKempOutputFormat = {
  "old-snapshot": "/functions/86851c2/8.4/",
  "new-snapshot": "/functions/86851c2/8.5/",
  results: [
    {
      function: "__alloc_disk_node",
      diffs: [
        {
          function: "kmalloc_node",
          "old-callstack": [
            { name: "kzalloc_node", file: "block/genhd.c", line: 1707 },
            { name: "kmalloc_node", file: "./include/linux/slab.h", line: 679 },
          ],
          "new-callstack": [
            { name: "kzalloc_node", file: "block/genhd.c", line: 1735 },
            { name: "kmalloc_node", file: "./include/linux/slab.h", line: 721 },
          ],
        },
        {
          function: "kmalloc_type",
          "old-callstack": [
            { name: "kzalloc_node", file: "block/genhd.c", line: 1707 },
            { name: "kmalloc_node", file: "./include/linux/slab.h", line: 679 },
            { name: "kmalloc_type", file: "./include/linux/slab.h", line: 575 },
          ],
          "new-callstack": [
            { name: "kzalloc_node", file: "block/genhd.c", line: 1735 },
            { name: "kmalloc_node", file: "./include/linux/slab.h", line: 721 },
            { name: "kmalloc_type", file: "./include/linux/slab.h", line: 599 },
          ],
        },
      ],
    },
  ],
  definitions: {
    __alloc_disk_node: {
      kind: "function",
      old: { line: 1695, file: "block/genhd.c", "end-line": 1746 },
      new: { line: 1723, file: "block/genhd.c", "end-line": 1774 },
    },
    kmalloc_node: {
      kind: "function",
      old: { line: 564, file: "include/linux/slab.h", "end-line": 580 },
      new: { line: 588, file: "include/linux/slab.h", "end-line": 604 },
    },
  },
};

const EXAMPLE_FOR_SYSCTL: DiffKempOutputFormat = {
  "old-snapshot": "/sysctl/86851c2/8.4/",
  "new-snapshot": "/sysctl/86851c2/8.5/",
  results: [
    {
      sysctl: "vm.zone_reclaim_mode",
      results: [
        {
          function: "__node_reclaim",
          diffs: [
            {
              function: "RECLAIM_UNMAP",
              "old-callstack": [{ name: "RECLAIM_UNMAP (macro)", file: "mm/vmscan.c", line: 4180 }],
              "new-callstack": [{ name: "RECLAIM_UNMAP (macro)", file: "mm/vmscan.c", line: 4192 }],
            },
          ],
        },
        {
          function: "node_pagecache_reclaimable",
          diffs: [
            {
              function: "RECLAIM_UNMAP",
              "old-callstack": [{ name: "RECLAIM_UNMAP (macro)", file: "mm/vmscan.c", line: 4149 }],
              "new-callstack": [{ name: "RECLAIM_UNMAP (macro)", file: "mm/vmscan.c", line: 4161 }],
            },
          ],
        },
      ],
    },
  ],
  definitions: {
    __node_reclaim: {
      kind: "function",
      old: { line: 4168, file: "mm/vmscan.c", "end-line": 4217 },
      new: { line: 4180, file: "mm/vmscan.c", "end-line": 4229 },
    },
    node_pagecache_reclaimable: {
      kind: "function",
      old: { line: 4138, file: "mm/vmscan.c", "end-line": 4163 },
      new: { line: 4150, file: "mm/vmscan.c", "end-line": 4175 },
    },
  },
};

test("it should be possible to extract differences from diffkemp-out.yaml for functions", () => {
  const differences = Differences.fromDiffKempOut(EXAMPLE_FOR_FUNCTIONS);
  expect(differences.oldSrcPath).toBe("/functions/86851c2/8.4/");
  expect(differences.newSrcPath).toBe("/functions/86851c2/8.5/");
  expect(differences.getCompared()).toEqual(["__alloc_disk_node"]);
  expect(differences.comparedDiffering).toEqual(
    new Map([["__alloc_disk_node", ["kmalloc_node", "kmalloc_type"]]]),
  );
  expect(differences.getDifferingCompared()).toEqual(
    new Map([
      ["kmalloc_node", new Set(["__alloc_disk_node"])],
      ["kmalloc_type", new Set(["__alloc_disk_node"])],
    ]),
  );
  expect(differences.getDiffering()).toEqual(["kmalloc_node", "kmalloc_type"]);
  expect(differences.getDefinitionForDiffering("kmalloc_node")).toEqual({
    kind: "function",
    old: { line: 564, file: "include/linux/slab.h", "end-line": 580 },
    new: { line: 588, file: "include/linux/slab.h", "end-line": 604 },
  });
});

test("it should be possible to extract differences from diffkemp-out.yaml for sysctl", () => {
  const differences = Differences.fromDiffKempOut(EXAMPLE_FOR_SYSCTL);
  expect(differences.oldSrcPath).toBe("/sysctl/86851c2/8.4/");
  expect(differences.newSrcPath).toBe("/sysctl/86851c2/8.5/");
  expect(differences.getCompared()).toEqual(["__node_reclaim", "node_pagecache_reclaimable"]);
  expect(differences.comparedDiffering).toEqual(
    new Map([
      ["__node_reclaim", ["RECLAIM_UNMAP"]],
      ["node_pagecache_reclaimable", ["RECLAIM_UNMAP"]],
    ]),
  );
  expect(differences.getDifferingCompared()).toEqual(
    new Map([["RECLAIM_UNMAP", new Set(["__node_reclaim", "node_pagecache_reclaimable"])]]),
  );
  expect(differences.getDiffering()).toEqual(["RECLAIM_UNMAP"]);
});
