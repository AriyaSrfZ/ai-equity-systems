import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workflowPath = path.join(rootDir, 'ai_ad_agent_n8n_workflow_cleaned.json');

const rawContent = fs.readFileSync(workflowPath, 'utf8');
const workflow = JSON.parse(rawContent);
const nodes = workflow.nodes || [];
const nodesByName = new Map(nodes.map(n => [n.name, n]));
const nodesById = new Map(nodes.map(n => [n.id, n]));

test('1. Workflow JSON file exists and parses cleanly', () => {
  assert.ok(rawContent.length > 0, 'Workflow JSON should not be empty');
  assert.equal(typeof workflow, 'object', 'Workflow must parse to an object');
});

test('2. Workflow top-level structure conforms to n8n specifications', () => {
  assert.ok(Array.isArray(workflow.nodes), 'Workflow must have a nodes array');
  assert.ok(typeof workflow.connections === 'object', 'Workflow must have connections object');
  assert.ok(workflow.nodes.length >= 50, 'Workflow should contain all pipeline nodes');
});

test('3. Node uniqueness: all nodes have unique names and valid IDs', () => {
  assert.equal(nodesByName.size, nodes.length, 'All node names must be unique');
  assert.equal(nodesById.size, nodes.length, 'All node IDs must be unique');
  for (const node of nodes) {
    assert.ok(node.name && node.name.trim().length > 0, `Node ${node.id} must have a name`);
    assert.ok(node.type && node.type.trim().length > 0, `Node ${node.name} must have a type`);
  }
});

test('4. Connection graph integrity: all connection sources and targets exist', () => {
  const connections = workflow.connections || {};
  for (const [sourceName, outputs] of Object.entries(connections)) {
    assert.ok(nodesByName.has(sourceName), `Connection source "${sourceName}" must exist in nodes`);
    for (const [outputType, groups] of Object.entries(outputs)) {
      assert.ok(Array.isArray(groups), `Outputs for ${sourceName}.${outputType} must be an array`);
      for (const group of groups) {
        assert.ok(Array.isArray(group), `Connection group in ${sourceName} must be an array`);
        for (const conn of group) {
          assert.ok(nodesByName.has(conn.node), `Connection target "${conn.node}" from "${sourceName}" must exist in nodes`);
        }
      }
    }
  }
});

test('5. Switch node conditions are valid and contain no corrupted placeholders', () => {
  const switchNode = nodesByName.get('Switch');
  assert.ok(switchNode, 'Switch node must exist');
  const rules = switchNode.parameters?.rules?.values || [];
  assert.equal(rules.length, 3, 'Switch node must define 3 ad-type routing branches');

  for (const rule of rules) {
    for (const cond of rule.conditions?.conditions || []) {
      assert.notEqual(cond.id, 'Key YOUR_FAL_AI_API_KEY_HERE', 'Condition ID must not be corrupted by API key placeholder');
      assert.match(cond.id, /^[0-9a-f-]{36}$/i, `Condition ID "${cond.id}" should be a valid UUID`);
    }
  }
});

test('6. Merge1 node specifies chooseBranch mode with explicit output selection', () => {
  const mergeNode = nodesByName.get('Merge1');
  assert.ok(mergeNode, 'Merge1 node must exist');
  assert.equal(mergeNode.parameters?.mode, 'chooseBranch', 'Merge1 mode must be chooseBranch');
  assert.equal(mergeNode.parameters?.output, 'input1', 'Merge1 must explicitly output branch input1 (video clips from Loop Over Items)');
});

test('7. Google Sheets column mappings: Log the Idea3 maps characters properly', () => {
  const log3 = nodesByName.get('Log the Idea3');
  assert.ok(log3, 'Log the Idea3 node must exist');
  const colValues = log3.parameters?.columns?.value || {};
  assert.ok(
    colValues.Spokesperson && colValues.Spokesperson.includes('Character A') && colValues.Spokesperson.includes('Character B'),
    'Log the Idea3 Spokesperson column must map Character A and Character B'
  );
});

test('8. Code1 node: splits script into paragraphs', () => {
  const codeNode = nodesByName.get('Code1');
  assert.ok(codeNode, 'Code1 node must exist');
  const jsCode = codeNode.parameters?.jsCode;
  assert.ok(jsCode, 'Code1 must have jsCode');

  const context = {
    $input: {
      first: () => ({
        json: {
          message: {
            content: "Sentence one about the product.\nSentence two explaining the benefit.\nSentence three with call to action."
          }
        }
      })
    }
  };
  vm.createContext(context);
  const result = vm.runInContext(`(() => { ${jsCode} })()`, context);

  assert.equal(result.length, 3);
  assert.equal(result[0].json.paragraph, 'Sentence one about the product.');
  assert.equal(result[1].json.paragraph, 'Sentence two explaining the benefit.');
  assert.equal(result[2].json.paragraph, 'Sentence three with call to action.');
});

test('9. Code2 & Code3 nodes: split dialogue with index tracking', () => {
  for (const name of ['Code2', 'Code3']) {
    const codeNode = nodesByName.get(name);
    assert.ok(codeNode, `${name} node must exist`);
    const jsCode = codeNode.parameters?.jsCode;
    assert.ok(jsCode, `${name} must have jsCode`);

    const context = {
      $input: {
        first: () => ({
          json: {
            message: {
              content: "A: First statement.\nB: Second statement response."
            }
          }
        })
      }
    };
    vm.createContext(context);
    const result = vm.runInContext(`(() => { ${jsCode} })()`, context);

    assert.equal(result.length, 2);
    assert.equal(result[0].json.Index, 0);
    assert.equal(result[0].json.paragraph, 'A: First statement.');
    assert.equal(result[1].json.Index, 1);
    assert.equal(result[1].json.paragraph, 'B: Second statement response.');
  }
});

test('10. Code4 node: generates Shotstack timeline with music selection and fallback', () => {
  const codeNode = nodesByName.get('Code4');
  assert.ok(codeNode, 'Code4 node must exist');
  const jsCode = codeNode.parameters?.jsCode;
  assert.ok(jsCode, 'Code4 must have jsCode');

  const runCode4 = (inputMusic, formMusic) => {
    const context = {
      $input: {
        first: () => ({
          json: inputMusic ? { 'Background Music': inputMusic } : {}
        }),
        all: () => [
          { json: { video: { url: 'https://fal.media/video1.mp4' } } },
          { json: { video: { url: 'https://fal.media/video2.mp4' } } }
        ]
      },
      $: (nodeName) => ({
        first: () => ({ json: { 'Background Music': formMusic } })
      })
    };
    vm.createContext(context);
    return vm.runInContext(`(() => { ${jsCode} })()`, context);
  };

  // Case A: Music from input
  const resA = runCode4("Cinematic & Emotional - Smooth, cinematic energy with emotional depth. Great for storytelling and brand narratives.", null);
  assert.equal(resA[0].json.timeline.soundtrack.src, 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/freepd/motions.mp3');
  assert.equal(resA[0].json.timeline.tracks[0].clips.length, 2);
  assert.equal(resA[0].json.timeline.tracks[0].clips[0].asset.src, 'https://fal.media/video1.mp4');

  // Case B: Music recovered from form fallback
  const resB = runCode4(null, "Uplifting & Celebratory - Bright and energetic. Perfect for product launches, highlights, or upbeat promos.");
  assert.equal(resB[0].json.timeline.soundtrack.src, 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/freepd/fireworks.mp3');

  // Case C: Fallback default
  const resC = runCode4(null, null);
  assert.equal(resC[0].json.timeline.soundtrack.src, 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/freepd/advertising.mp3');
});

test('11. Code5 node: generates Shotstack timeline without soundtrack', () => {
  const codeNode = nodesByName.get('Code5');
  assert.ok(codeNode, 'Code5 node must exist');
  const jsCode = codeNode.parameters?.jsCode;
  assert.ok(jsCode, 'Code5 must have jsCode');

  const context = {
    $input: {
      first: () => ({ json: {} }),
      all: () => [
        { json: { video: { url: 'https://fal.media/clip1.mp4' } } },
        { json: { video: { url: 'https://fal.media/clip2.mp4' } } }
      ]
    }
  };
  vm.createContext(context);
  const result = vm.runInContext(`(() => { ${jsCode} })()`, context);

  assert.equal(result.length, 1);
  assert.equal(result[0].json.timeline.soundtrack, undefined, 'Code5 timeline should not have a soundtrack');
  assert.equal(result[0].json.timeline.tracks[0].clips.length, 2);
  assert.equal(result[0].json.output.format, 'mp4');
});

test('12. Asset integrity: video examples and setup documents exist and are valid', () => {
  const assets = [
    { name: 'Ad Example 1.mp4', minSize: 10000000, isVideo: true },
    { name: 'Ad Example 2.mp4', minSize: 10000000, isVideo: true },
    { name: 'Ad Example 3.mp4', minSize: 10000000, isVideo: true },
    { name: 'SetUp Guide.docx', minSize: 50000, isDocx: true },
    { name: 'User Guide.docx', minSize: 5000, isDocx: true }
  ];

  for (const asset of assets) {
    const fullPath = path.join(rootDir, asset.name);
    assert.ok(fs.existsSync(fullPath), `Asset file ${asset.name} must exist`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size >= asset.minSize, `Asset ${asset.name} size (${stats.size}) must be at least ${asset.minSize} bytes`);

    const fd = fs.openSync(fullPath, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    if (asset.isDocx) {
      // DOCX is a ZIP file starting with PK\x03\x04
      assert.equal(buffer[0], 0x50, `${asset.name} must be a valid zip/docx archive`);
      assert.equal(buffer[1], 0x4B, `${asset.name} must be a valid zip/docx archive`);
    } else if (asset.isVideo) {
      // MP4 files typically start with ftyp box at offset 4
      const ftyp = buffer.toString('utf8', 4, 8);
      assert.equal(ftyp, 'ftyp', `${asset.name} must have MP4 ftyp marker`);
    }
  }
});
