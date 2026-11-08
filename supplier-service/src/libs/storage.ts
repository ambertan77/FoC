// AI Assistance Disclosure:
// Tool: Claude (Opus 5.5)
// Date: 2026-11-08
// Scope: Create boilerplate code that implements an interface to storing and uploading images to either local or cloud
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";

import { AppError } from "../errors/errors.js";
import config from "../config/config.js";

export interface Storage {
    init(): Promise<void>; // initialise storage system upon application startup
    save(filename: string, body: Buffer, contentType: string): Promise<string>; // returns the public image URL
    read(filename: string): Promise<Readable | null>; // return the image body 
}

// rejects names which try to access the directories outside of the current directory
const safeFilename = (filename: string): string => {
    const clean = path.basename(filename);
    if (clean === "." || clean === "..") {
        throw new AppError("Invalid asset name", 400, "BAD_REQUEST");
    }
    return clean;
};

//  --------------------------------- Reading and writing to LOCAL disk ---------------------------------------
const moduleDir = path.dirname(fileURLToPath(import.meta.url)); // get the current directory and file name

export class LocalStorage implements Storage {
    private readonly dir = path.resolve(moduleDir, "../../uploads"); // set the directory we want to put uploads into

    async init(): Promise<void> {
        await fs.mkdir(this.dir, { recursive: true });
    }

    async save(filename: string, body: Buffer, _contentType: string): Promise<string> {
        const clean = safeFilename(filename);
        await fs.writeFile(path.join(this.dir, clean), body);

        const origin = config.assetsPublicUrl;
        return `${origin}/api/suppliers/assets/images/${clean}`; // link to accessing the image
    }

    async read(filename: string): Promise<Readable> {
        const filePath = path.join(this.dir, safeFilename(filename));
        try {
            await fs.access(filePath);
        } catch {
            throw new AppError(`No file named ${filename} was found`, 404);
        }
        return createReadStream(filePath); // image stream
    }
}

//  ------------------------- Reading and writing to AWS S3 ---------------------------------
export class S3Storage implements Storage {
    private readonly s3 = new S3Client({ region: config.awsRegion });

    async init(): Promise<void> {}

    async save(filename: string, body: Buffer, contentType: string): Promise<string> {
        const key = `images/${safeFilename(filename)}`;
        await this.s3.send(new PutObjectCommand({
            Bucket: config.s3Bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: "public,max-age=31536000,immutable",
        }));
        return `${config.assetsPublicUrl}/${key}`;
    }

    async read(filename: string): Promise<Readable | null> {
        try {
            const result = await this.s3.send(new GetObjectCommand({
                Bucket: config.s3Bucket,
                Key: `images/${safeFilename(filename)}`,
            }));
            return (result.Body as Readable | undefined) ?? null;
        } catch (error) {
            if (error instanceof NoSuchKey) {
                throw new AppError(`No file named ${filename} was found`, 404);
            }
            throw error;
        }
    }
}

export const storage: Storage = config.storage === "local" ? new LocalStorage() : new S3Storage();
