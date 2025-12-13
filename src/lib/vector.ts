import { Index } from "@upstash/vector"

const index = new Index({
    url: process.env.UPSTASH_VECTOR_URL,
    token: process.env.UPSTASH_VECTOR_TOKEN,
})

export const storeVector = async ({ id, data, metadata }: { id: string, data: string, metadata: any }) => {
    try {
        const result = await index.upsert({
            id,
            data,
            metadata,
        });

        return result;
    }
    catch (error) {
        throw error;
    }
}

export const searchVector = async ({ data, topK = 3 }: { data: string; topK?: number }) => {
    try {
        const result = await index.query({
            data,
            topK,
            includeVectors: true,
            includeMetadata: true,
        });

        return result;
    }
    catch (error) {
        throw error;
    }
}

export const removeVectors = async ({ prefix }: { prefix: string }) => {
    try {
        const result = await index.delete({
            prefix,
        });

        return result;
    }
    catch (error) {
        throw error;
    }
}