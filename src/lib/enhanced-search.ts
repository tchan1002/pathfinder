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
 * Generates a comprehensive answer based on the chosen page content
 */
export async function generateAnswerFromPage(
  originalQuery: string,
  chosenPage: SearchResult
): Promise<string> {
  if (!openai) {
    // Fallback: return a simple summary
    return chosenPage.summary || "No summary available.";
  }

  try {
    const pageContent = chosenPage.content || chosenPage.summary || "";
    const pageTitle = chosenPage.title || chosenPage.url;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that answers questions based on web page content. 
          
          Guidelines:
          - Answer the user's question directly and comprehensively
          - Use information from the provided page content
          - If the page doesn't contain enough information to answer the question, say so
          - Keep answers concise but informative
          - Include relevant details and context
          - Cite the page title when relevant`
        },
        {
          role: "user",
          content: `Question: "${originalQuery}"

Page: ${pageTitle}
Content: ${pageContent.slice(0, 4000)}

Answer:`
        }
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    return completion.choices[0]?.message.content?.trim() || "Unable to generate answer.";
  } catch (error) {
    console.error("Answer generation failed:", error);
    return chosenPage.summary || "Unable to generate answer.";
  }
}
