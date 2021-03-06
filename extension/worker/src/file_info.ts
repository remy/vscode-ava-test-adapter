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

import hash from './hash'
import TestInfo from './test_info'
import ConfigInfo from './config_info'

/** Stores information on a test file. */
export default class FileInfo {
	/** The ID of the test case. */
	public readonly id: string

	/** The name of the test file. */
	public readonly name: string

	/** The ConfigInfo the FileInfo belongs to */
	private readonly config: ConfigInfo

	/** The test cases from the test file. */
	private tests: TestInfo[] = []

	/** Set of active file IDs. */
	private static readonly fileSet = new Set<string>()

	/** Used to check if an ID is in use. */
	public static readonly idExists = FileInfo.fileSet.has.bind(FileInfo.fileSet)

	/** Removes the FileInfo from fileSet. */
	public readonly dispose: () => void

	/**
	 * Constructor.
	 * @param name The name of the test file.
	 * @param config The ConfigInfo the FileInfo belongs to.
	 */
	public constructor(name: string, config: ConfigInfo) {
		this.name = name
		this.config = config
		const i = hash(name, FileInfo.idExists, (h): string => 'f' + h)
		this.id = i
		const s = FileInfo.fileSet
		s.add(i)
		this.dispose = s.delete.bind(s, i)
		config.addFile(this)
	}

	/**
	 * Gets the ID of a test in the file.
	 * @param title The title of the test to fetch the ID of.
	 */
	public getTestID(title: string): string | null {
		const x = this.tests.find((t): boolean => t.name === title)
		return x ? x.id : null
	}

	/**
	 * Addes a test to the file.
	 * @param t The TestInfo to add.
	 */
	public addTest(t: TestInfo): void {
		this.tests.push(t)
		this.config.addTest(t)
	}

	/** Gets an iterator for the file's tests. */
	public get entries(): IterableIterator<TestInfo> {
		return this.tests.values()
	}
}
