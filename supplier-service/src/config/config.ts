import "dotenv/config";

function getEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}

function getEnvNumber(name: string): number {
    const value = getEnv(name);
    const number = Number(value);

    if (Number.isNaN(number)) {
        throw new Error(`${name} must be a number`);
    }

    return number;
}

function getEnvStorage(name: string) {
    const value = getEnv(name);

    if (value !== "local" && value !== "s3") {
        throw new Error(`${name} must be either "local" or "s3"`);
    }

    return value;
}

const storage = getEnvStorage("STORAGE");

const config = {
    port: getEnvNumber("PORT"),
    databaseUrl: getEnv("DATABASE_URL"),
    frontendUrl: getEnv("FRONTEND_URL"),
    jwtPublicKeyPath: getEnv("JWT_PUBLIC_KEY_PATH"),
    storage, // "local" stores images on disk, "s3" stores them in aws s3
    assetsPublicUrl: process.env.ASSETS_PUBLIC_URL ?? "",
    s3Bucket: storage === "s3" ? getEnv("S3_BUCKET") : "", // for running in cloud, to get/post images in aws s3
    awsRegion: storage === "s3" ? getEnv("AWS_REGION") : "", // for running in cloud, to get/post images in aws s3
    orderSupplierServiceToken: getEnv("ORDER_SUPPLIER_SERVICE_TOKEN"),
};

export default config;