import type { Model } from '@basemodel/schema';

/**
 * Heuristic classification of raw API model ids into canonical modalities
 * and capability flags.
 *
 * The generic OpenAI-compatible `/models` endpoint reports only ids (and
 * sometimes context lengths), so without this step every collected model
 * would be stored as a text-only chat model — mislabeling embedding models,
 * TTS/ASR models, image generators, and image-processing tools.
 *
 * Rules are intentionally conservative: when nothing matches, the model
 * stays a plain text model. Custom gateway plugins may still emit their own
 * fields, which take precedence during merge.
 */
export type ModelClassification = Pick<
  Model,
  | 'modality'
  | 'embedding_support'
  | 'audio_support'
  | 'image_generation'
  | 'vision_support'
  | 'reasoning_support'
>;

const EMBEDDING_PATTERN =
  /(embed|rerank|bge-|e5-|gte-|jina|clip-|multilingual-e5|snowflake|mxbai|xlm-r)/;
const ASR_PATTERN =
  /(whisper|transcri|sensevoice|paraformer|seamless|voice-activity|asr|speech-to-text)/;
const TTS_PATTERN =
  /(tts|speech|chatterbox|kokoro|csm-|bark|parler|orpheus|sesame|voice-clone|text-to-speech)/;
const IMAGE_GENERATION_PATTERN =
  /(flux|sdxl|stable-diffusion|dall-?e|imagen|hidream|lumina|qwen-image|auraflow|pixart|deepfloyd|bria|fibo|recraft|gpt-image|playground-v2|kosmos|sd3|sd4)/;
const IMAGE_TOOL_PATTERN =
  /(blur|erase|expand|upscale|inpaint|outpaint|background|segment|depth|super-resolution|remove|edit-image|image-edit)/;
const VIDEO_PATTERN = /(video|sora|veo-|kling|ltx|wan-|hunyuan|cosmos|mochi|cogvideo)/;
const CODE_PATTERN =
  /(coder|codellama|codestral|starcoder|wizardcoder|devstral|code-bison|deepseek-coder)/;
const REASONING_PATTERN = /(^|[-./])(r1|qwq|o1|o3|o4-mini)([-./:]|$)|thinking/;
const VISION_PATTERN =
  /(vision|-vl[-./]|qwen.*vl|internvl|llava|pixtral|gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|gemini|claude-(3|4|5|opus|sonnet|haiku)|kimi|glm-4v|grok)/;

/**
 * Classifies a raw upstream model id into canonical modality and capability
 * flags. Deterministic and side-effect free; order of checks encodes
 * precedence (specialized classes win over generic chat heuristics).
 */
export function classifyApiModel(rawId: string): ModelClassification {
  const id = rawId.toLowerCase();

  if (EMBEDDING_PATTERN.test(id)) {
    return {
      modality: ['text', 'embedding'],
      embedding_support: true,
      audio_support: false,
      image_generation: false,
      vision_support: false,
      reasoning_support: false,
    };
  }

  if (ASR_PATTERN.test(id)) {
    return {
      modality: ['audio', 'text'],
      embedding_support: false,
      audio_support: true,
      image_generation: false,
      vision_support: false,
      reasoning_support: false,
    };
  }

  if (TTS_PATTERN.test(id)) {
    return {
      modality: ['text', 'audio'],
      embedding_support: false,
      audio_support: true,
      image_generation: false,
      vision_support: false,
      reasoning_support: false,
    };
  }

  if (IMAGE_TOOL_PATTERN.test(id)) {
    // Image-processing utilities: image in/out, not generators.
    return {
      modality: ['image'],
      embedding_support: false,
      audio_support: false,
      image_generation: false,
      vision_support: false,
      reasoning_support: false,
    };
  }

  if (IMAGE_GENERATION_PATTERN.test(id)) {
    return {
      modality: ['image'],
      embedding_support: false,
      audio_support: false,
      image_generation: true,
      vision_support: false,
      reasoning_support: false,
    };
  }

  if (VIDEO_PATTERN.test(id)) {
    return {
      modality: ['video'],
      embedding_support: false,
      audio_support: false,
      image_generation: false,
      vision_support: false,
      reasoning_support: false,
    };
  }

  // Generic chat model; refine with vision/code/reasoning signals.
  const vision = VISION_PATTERN.test(id);
  const modality: Model['modality'] = CODE_PATTERN.test(id)
    ? ['text', 'code']
    : vision
      ? ['text', 'image']
      : ['text'];

  return {
    modality,
    embedding_support: false,
    audio_support: false,
    image_generation: false,
    vision_support: vision,
    reasoning_support: REASONING_PATTERN.test(id),
  };
}
