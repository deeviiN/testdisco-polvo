import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "No image provided", code: "MISSING_PARAMETER" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For signature background removal, we process client-side using Canvas API
    // The edge function validates the input and returns instructions
    // Actual pixel manipulation happens on the client for better performance
    
    // Validate it's a real base64 image
    const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    try {
      const decoded = atob(rawBase64);
      if (decoded.length < 100) {
        return new Response(JSON.stringify({ error: "Image too small", code: "VALIDATION_FAILED" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid base64 image", code: "VALIDATION_FAILED" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return the image as-is with processing instructions for the client
    // The client-side Canvas API will handle the actual background removal
    // This is more reliable than AI image generation for this specific task
    return new Response(JSON.stringify({ 
      processedImage: imageBase64,
      processOnClient: true,
      threshold: 200, // brightness threshold: pixels brighter than this become transparent
      message: "Apply client-side background removal using Canvas API"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(error, { fn: "remove-signature-bg", step: "handler" }, 500, "Internal server error");
  }
});
