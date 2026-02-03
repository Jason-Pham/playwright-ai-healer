import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function run() {
    const modelsToTry = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-pro',
        'gemini-1.0-pro',
    ];

    console.log('Starting model check...');
    for (const modelName of modelsToTry) {
        try {
            console.log(`\nTesting model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent('Hello');
            console.log(`✅ SUCCESS with ${modelName}`);
            console.log(`Response: ${result.response.text().substring(0, 50)}...`);
            process.exit(0); // Exit on first success
        } catch (e) {
            console.log(`❌ FAILED with ${modelName}: ${(e as Error).message.split('\n')[0]}`);
        }
    }
    console.log('\n❌ All models failed.');
}

run();
