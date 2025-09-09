import OpenAI from "openai";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface SearchResult {
  url: string;
  title: string | null;
  summary: string | null;
  screenshot: string | null;
  similarity: number;
  distance: number | null;
  content?: string; // Full content for better analysis
}

/**
 * Rewrites a user query to be more effective for vector search
 */
export async function rewriteQueryForVectorSearch(originalQuery: string): Promise<string> {
  if (!openai) {
    // Fallback: return original query if no OpenAI key
    return originalQuery;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a search query optimizer. Rewrite user queries to be more effective for vector similarity search. 
          
          Your goal is to:
          1. Expand the query with relevant synonyms and related terms
          2. Include both specific and general terms that might appear in web content
          3. Add context that helps match against page titles, headings, and content
          4. Keep the rewritten query concise but comprehensive
          5. Preserve the original intent while making it more searchable
          
          Examples:
          - "how to login" → "login authentication sign in access account credentials"
          - "pricing plans" → "pricing plans costs subscription fees rates billing"
          - "contact support" → "contact support help customer service assistance reach out"`
        },
        {
          role: "user",
          content: `Original query: "${originalQuery}"\n\nRewritten query for vector search:`
        }
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    return completion.choices[0]?.message.content?.trim() || originalQuery;
  } catch (error) {
    console.error("Query rewriting failed:", error);
    return originalQuery;
  }
}

/**
 * Analyzes search results to find the best matching page for the original query
 */
export async function findBestMatchingPage(
  originalQuery: string,
  searchResults: SearchResult[]
): Promise<SearchResult | null> {
  if (!openai || searchResults.length === 0) {
    return searchResults[0] || null;
  }

  try {
    // Prepare context for analysis
    const resultsContext = searchResults
      .slice(0, 10) // Analyze top 10 results
      .map((result, index) => {
        const content = result.content || result.summary || "";
        return `[${index + 1}] ${result.title || result.url}
Content: ${content.slice(0, 1000)}...`;
      })
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a search result analyzer. Given a user query and a list of search results, determine which result best answers the query.

          Analyze each result and return the index number (1-based) of the best match. Consider:
          - Relevance to the original query
          - Completeness of information
          - Quality and clarity of content
          - Whether the result directly answers the question

          If no result adequately answers the query, return "0".

          Respond with only the index number, nothing else.`
        },
        {
          role: "user",
          content: `Query: "${originalQuery}"

Search Results:
${resultsContext}

Which result best answers the query? (Return only the index number):`
        }
      ],
      temperature: 0.1,
      max_tokens: 10,
    });

    const response = completion.choices[0]?.message.content?.trim();
    const bestIndex = parseInt(response || "1") - 1; // Convert to 0-based index
    
    if (bestIndex >= 0 && bestIndex < searchResults.length) {
      return searchResults[bestIndex] || null;
    }
    
    return searchResults[0] || null; // Fallback to first result
  } catch (error) {
    console.error("Best match analysis failed:", error);
    return searchResults[0] || null;
  }
}

/**
 * Generates a witty, conversational answer like a mountain guide
 */
export async function generateAnswerFromPage(
  originalQuery: string,
  chosenPage: SearchResult
): Promise<string> {
  if (!openai) {
    return generateSimpleGuideAnswer(originalQuery, chosenPage);
  }

  try {
    const pageContent = chosenPage.content || chosenPage.summary || "";
    const pageTitle = chosenPage.title || chosenPage.url;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You're a knowledgeable mountain guide who gives direct, helpful answers. Be friendly, confident, and straight to the point.

          RULES:
          - ALWAYS under 50 words
          - Be conversational but not overly casual
          - Start with "Here's what you're looking for:" or similar
          - Give main points, not summaries
          - Use confident, helpful language
          - If you don't know, say so directly
          - Be gender-neutral and inclusive
          
          Examples:
          - "Here's what you're looking for: Login button's in the top right corner. Just click it and you're in."
          - "The pricing starts at $29/month for the basic plan. Pretty solid value if you ask me. Check out the pricing page for all the details."
          - "Here's what you need: Contact info is right there on the page. Phone, email, the works. Can't miss it."`
        },
        {
          role: "user",
          content: `Question: "${originalQuery}"

Page: ${pageTitle}
Content: ${pageContent.slice(0, 4000)}

Give me a mountain guide style answer:`
        }
      ],
      temperature: 0.6, // Higher for more personality
      max_tokens: 80, // Keep it short
    });

    return completion.choices[0]?.message.content?.trim() || generateSimpleGuideAnswer(originalQuery, chosenPage);
  } catch (error) {
    console.error("Answer generation failed:", error);
    return generateSimpleGuideAnswer(originalQuery, chosenPage);
  }
}

/**
 * Simple fallback answer in mountain guide style
 */
function generateSimpleGuideAnswer(query: string, chosenPage: SearchResult): string {
  const title = chosenPage.title || "";
  const summary = chosenPage.summary || "";
  
  // Extract key info from summary
  const keyPoints = summary.split('.').slice(0, 2).join('.').trim();
  
  if (keyPoints.length > 20) {
    return `Here's what you're looking for: ${keyPoints} Check out ${title} for the full details.`;
  }
  
  if (title) {
    return `Here's the deal: Found info about ${title}. That's what you're after, right?`;
  }
  
  return "Here's what I found: Some relevant info on this page. Worth checking out.";
}