import { NextRequest, NextResponse } from 'next/server';

interface ChatRequest {
  message: string;
  bookId: string;
  conversationId?: string;
}

/**
 * POST /api/chat
 *
 * Handles chat messages for a specific book.
 *
 * In production, this would:
 * 1. Retrieve the book content from the database
 * 2. Use a RAG (Retrieval-Augmented Generation) system to find relevant passages
 * 3. Stream the AI response using Vercel AI SDK
 * 4. Save the message and response to the database
 *
 * Example integration with Vercel AI SDK:
 * import { streamText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * const stream = streamText({
 *   model: openai('gpt-4'),
 *   system: `You are an AI assistant specialized in discussing books...`,
 *   messages: [...],
 * });
 *
 * return stream.toDataStreamResponse();
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, bookId, conversationId } = body;

    if (!message || !bookId) {
      return NextResponse.json(
        { error: 'Missing required fields: message and bookId' },
        { status: 400 }
      );
    }

    // Mock streaming response
    // In production, stream actual AI response with Vercel AI SDK
    const mockResponse = generateMockResponse(message, bookId);

    // Create a simple text stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Simulate streaming by sending chunks
        const chunks = mockResponse.split(' ');
        let index = 0;

        const sendChunk = () => {
          if (index < chunks.length) {
            controller.enqueue(
              encoder.encode(chunks[index] + ' ')
            );
            index++;
            // Simulate typing delay
            setTimeout(sendChunk, Math.random() * 50 + 20);
          } else {
            controller.close();
          }
        };

        sendChunk();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate mock response based on user message and book
 * This simulates what an AI would respond with after RAG lookup
 */
function generateMockResponse(message: string, bookId: string): string {
  const lowerMessage = message.toLowerCase();

  // Mock responses for common questions about Gibbon's book
  const responses: Record<string, string> = {
    'what is this book about?':
      'The Decline and Fall of the Roman Empire is a monumental historical work examining the collapse of the Western Roman Empire. Gibbon traces the political, social, and religious factors that contributed to Rome\'s fall, spanning from the height of the empire under the Antonines to the fall of Constantinople. The work is known for its scholarly analysis and its examination of Christianity\'s role in the empire\'s fate.',

    'summarize the main themes':
      'The main themes include: 1) The inevitable decline of great empires, 2) The role of political instability and internal strife, 3) The impact of barbarian invasions, 4) The complex relationship between religion and governance, 5) The preservation of Roman culture and law in successor states. Gibbon demonstrates that Rome\'s fall was not a sudden catastrophe but a gradual process.',

    'what are the key arguments?':
      'Gibbon argues that Rome\'s fall was not a sudden collapse but a gradual process. He emphasizes multiple contributing factors: economic exhaustion, military pressure, political instability, and the transformative role of Christianity. He challenges the idea that a single cause led to Rome\'s downfall, instead presenting a complex interplay of forces.',

    'what were the main causes of rome\'s decline?':
      'According to Gibbon, the primary causes include: economic and fiscal crises limiting military spending, constant military pressure from barbarian peoples along vast frontiers, political fragmentation and civil wars weakening central authority, the shift of imperial power eastward to Constantinople, and the rise of Christianity which altered the empire\'s values.',

    'how did christianity affect the roman empire?':
      'Gibbon analyzes how Christianity transformed Roman society by shifting values from martial virtue and civic duty to spiritual concerns. He argues the religion redirected resources from military defense and contributed to a shift in imperial priorities, though this remains one of the most debated aspects of his work.',

    'what role did the barbarians play?':
      'The barbarian peoples, including the Goths, Visigoths, and later the Huns, pressed against Roman frontiers throughout the empire\'s decline. Rather than being inherently destructive, Gibbon shows how they were often driven by their own pressures and eventually established successor kingdoms that preserved Roman legal and cultural traditions.',

    'explain the political structure of rome':
      'The Roman political system featured the Senate, which appeared to hold sovereign authority while the Emperor held executive powers. This constitutional fiction masked the reality of imperial rule. Governors administered provinces, magistrates handled justice, and military commanders controlled armies, all ultimately answerable to the emperor.',
  };

  // Check for matching response
  for (const [key, response] of Object.entries(responses)) {
    if (lowerMessage.includes(key) || key.includes(lowerMessage)) {
      return response;
    }
  }

  // Default response for questions not in the mock set
  return `That\'s an interesting question about the Decline and Fall of the Roman Empire. Based on Gibbon\'s comprehensive historical analysis, this complex topic involves examining multiple interconnected factors including political dynamics, military challenges, economic conditions, and cultural transformations. Gibbon\'s work demonstrates that understanding Rome\'s decline requires considering the interplay of these various forces over centuries rather than attributing it to a single cause. Would you like me to explore any specific aspect of this topic in more detail?`;
}
