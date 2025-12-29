import { Index } from "@upstash/vector"

const index = new Index({
    url: process.env.UPSTASH_VECTOR_URL,
    token: process.env.UPSTASH_VECTOR_TOKEN,
})

export const storeVector = async ({ id, data, metadata, namespace }: { id: string, data: string, metadata: any, namespace?: string }) => {
    try {
        const result = await index.upsert({
            id,
            data,
            metadata,
        }, { namespace: namespace });

        return result;
    }
    catch (error) {
        throw error;
    }
}

export const searchVector = async ({ data, topK = 3, namespace }: { data: string; topK?: number; namespace?: string }) => {
    try {
        const result = await index.query({
            data,
            topK,
            includeVectors: false, // Changed to false to avoid returning raw embeddings
            includeMetadata: true,
            includeData: true, // Explicitly request the data field
        }, {
            namespace
        });

        return result;
    }
    catch (error) {
        throw error;
    }
}

export const removeVectors = async ({ prefix, namespace }: { prefix: string, namespace?: string }) => {
    try {
        const result = await index.delete({
            prefix,
        }, { namespace });

        return result;
    }
    catch (error) {
        throw error;
    }
}