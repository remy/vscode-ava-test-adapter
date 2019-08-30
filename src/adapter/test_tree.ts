/*
ISC License (ISC)

Copyright 2019 James Adam Armstrong

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above copyright
notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
*/

import path from 'path'
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api'
import { Log } from 'vscode-test-adapter-util/out/log'
import { Prefix, TestFile, TestCase } from '../ipc'

/** Interface for TestTree info. */
interface Info {
	/** The ID of the Info. */
	id: string
	/** The label of the Info. */
	label: string
	/** The file the Info is from. */
	file: string
}

/** Sorts the children of a TestSuiteInfo. */
function sortTestInfo(suite: TestInfo | TestSuiteInfo): TestSuiteInfo {
	const s = suite as TestSuiteInfo
	if (s.children) {
		s.children = s.children.sort((a, b): number => {
			return a.label.toLocaleLowerCase() < b.label.toLocaleLowerCase() ? -1 : 1
		})
		s.children.forEach(sortTestInfo)
	}
	return s
}

/** Tree of test information. */
export default class TestTree {
	/** The common prefix of test files in the latest configuration. */
	private prefix: string
	/** The root of the tree. */
	private rootSuite: TestSuiteInfo = {
		type: 'suite',
		id: 'root',
		label: 'AVA',
		children: [],
	}
	/** The path configuration files are relative to. */
	private readonly base: string
	/** The set of files. */
	private readonly files = new Set<string>()
	/** Maps file IDs to TestSuiteInfo. */
	private readonly suiteHash = new Map<string, TestSuiteInfo & Info>()
	/** Map of IDs to prefixes. */
	private readonly prefixHash = new Map<string, string>()
	/** Map of configuration file names to IDs. */
	private readonly configMap = new Map<string, string>()
	/** The Log to output to. */
	private readonly log: Log

	/**
	 * Constructor.
	 * @param log The Log to output to.
	 * @param base The path configuration files are relative to.
	 */
	public constructor(log: Log, base: string) {
		this.log = log
		this.prefix = base
		this.base = base
	}

	/**
	 * Pushes a configuration into the tree.
	 * @param meta Metadata to push.
	 */
	public pushPrefix(meta: Prefix): void {
		const log = this.log
		const id = meta.id
		const label = meta.file
		const file = this.base + meta.file
		if (log.enabled) {
			log.info(`${id} is the ID of config ${file}`)
		}
		const prefix = meta.prefix
		if (log.enabled) {
			log.info(`Received test file prefix ${prefix} from worker`)
		}
		const x: TestSuiteInfo & Info = {
			type: 'suite',
			id,
			label,
			file,
			tooltip: process.env.NODE_ENV === 'production' ? label : id,
			children: [],
		}
		this.prefix = prefix
		this.suiteHash.set(id, x)
		this.configMap.set(label, id)
		this.prefixHash.set(id, prefix)
		this.files.add(path.resolve(this.base, file))
		this.rootSuite.children.push(x)
	}

	/**
	 * Pushes a test file into the tree.
	 * @param meta Metadata to push.
	 */
	public pushFile(meta: TestFile): void {
		const log = this.log
		if (log.enabled) {
			log.info(`Received test file ${meta.id} from worker`)
		}
		const id = meta.id
		const label = meta.file
		const suite = this.suiteHash.get(meta.config)
		if (!suite) {
			log.error(`Test File for unknown Test Config: ${meta.config}`)
			return
		}
		const prefix = this.prefixHash.get(meta.config) || this.prefix
		const file = prefix + label
		const x: TestSuiteInfo & Info = {
			type: 'suite',
			id,
			label,
			file,
			tooltip: process.env.NODE_ENV === 'production' ? label : id,
			children: [],
		}
		this.suiteHash.set(id, x)
		this.prefixHash.set(id, prefix)
		suite.children.push(x)
		this.files.add(file)
	}

	/**
	 * Pushes a test case into the tree.
	 * @param meta Metadata to push.
	 */
	public pushTest(meta: TestCase): void {
		const log = this.log
		const id = meta.id
		if (log.enabled) {
			log.info(`Received test case ${id} of file ${meta.file} from worker`)
		}
		const label = meta.test
		const suite = this.suiteHash.get(meta.file)
		if (!suite) {
			log.error(`Test Case for unknown Test File: ${meta.file}`)
			return
		}
		const x: TestInfo & Info = {
			type: 'test',
			id,
			label,
			tooltip: process.env.NODE_ENV === 'production' ? label : id,
			file: suite.file,
		}
		suite.children.push(x)
	}

	/** Finishes building the tree. */
	public build(): void {
		this.suiteHash.clear()
		sortTestInfo(this.rootSuite)
	}

	/** Gets the root. */
	public get rootNode(): TestSuiteInfo {
		return this.rootSuite
	}

	/** Gets an iterator for the configuration map. */
	public getConfigs(): IterableIterator<[string, string]> {
		return this.configMap.entries()
	}

	/** Gets the files. */
	public getFiles(): Set<string> {
		return this.files
	}
}