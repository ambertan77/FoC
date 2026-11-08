// AI Assistance Disclosure:
// Tool: Claude (Opus 5.5)
// Date: 2026-11-08
// Scope: Create boilerplate code to test functions in the supplier.asset.service.ts file.
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { AppError } from "../errors/errors.js";

// mock storage object, so that the tests will leave s3 and local disk untouched
const storage = {
    init: mock.fn(async () => {}),
    save: mock.fn(async (filename: string, _body: Buffer, _contentType: string) => `/images/${filename}`),
    read: mock.fn(async (_filename: string): Promise<Readable | null> => null),
};
mock.module("../libs/storage.js", { namedExports: { storage } });

// imported after mock.module so that the service picks up the fake storage above
const { getContentType, getImage, uploadImage } = await import("./supplier.asset.service.js");

// reset the calls for each function before a test case starts
beforeEach(() => {
    storage.save.mock.resetCalls();
    storage.read.mock.resetCalls();
});

test("uploadImage is given a unique name and returns the access link once upload is successful", async () => {
    // the buffer mocks the image bytes
    const file = { originalname: "test.png", buffer: Buffer.from("x") } as Express.Multer.File;

    const url = await uploadImage(file);

    // the arguments that uploadImage passed to storage.save
    const [filename, body, contentType] = storage.save.mock.calls[0]!.arguments;
    assert.match(filename, /^[0-9a-f-]{36}\.png$/); // name of the file is now a uuid, with its original extension
    assert.equal(body, file.buffer);
    assert.equal(contentType, "image/png");
    assert.equal(url, `/images/${filename}`);
});

test("getImage returns the stored image with its content type", async () => {
    const mockStream = ["x"] // mock image stream returned by storage.read
    const body = Readable.from(mockStream);
    storage.read.mock.mockImplementationOnce(async () => body);

    const image = await getImage("photo.jpeg");

    assert.equal(image.body, body);
    assert.equal(image.contentType, "image/jpeg");
});

test("getImage returns error code 404 when no file with the specified name exists", async () => {
    await assert.rejects(
        () => getImage("missing.png"),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            assert.equal(error.code, "NOT_FOUND");
            return true;
        }
    )
});

test("getContentType rejects unsupported file types", () => {
    assert.throws(
        () => getContentType("file.svg"), 
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, "BAD_REQUEST");
            return true;
        }
    )
});
