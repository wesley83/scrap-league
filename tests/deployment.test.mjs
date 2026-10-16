import test from 'node:test';
import assert from 'node:assert/strict';
import {equivalent} from '../tools/deploy-pagelove.mjs';

test('HTML publication tolerates serialization but rejects changed runtime references',()=>{
 const a=Buffer.from('<!doctype html><html lang="en"><head><base href="./releases/sl-a/"><title>Scrap League</title></head><body><p>A &amp; B</p><script src="main.js"></script></body></html>');
 const b=Buffer.from('<html xmlns="http://www.w3.org/1999/xhtml" lang="en">\n<head><base href="./releases/sl-a/"/><title>Scrap League</title></head><body><p>A &amp; B</p><script src="main.js"></script></body></html>');
 assert.equal(equivalent('/index.html',a,b),true);
 assert.equal(equivalent('/index.html',a,Buffer.from(b.toString().replace('sl-a/','sl-b/'))),false);
 assert.equal(equivalent('/index.html',a,Buffer.from(b.toString().replace('main.js','other.js'))),false);
});

test('publication identity preserves executable text and exact non-HTML bytes',()=>{
 const a=Buffer.from('<html><head><script>const value="a  b";</script></head><body></body></html>');
 assert.equal(equivalent('/index.html',a,Buffer.from(a.toString().replace('a  b','a b'))),false);
 assert.equal(equivalent('/main.js',Buffer.from('x=1;'),Buffer.from('x=2;')),false);
 assert.equal(equivalent('/main.js',Buffer.from('x=1;'),Buffer.from('x=1;')),true);
});
