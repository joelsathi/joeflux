// Tool groups let an agent client list a core set and enable the rest on demand.
// Every tool belongs to exactly one group; tests/context-budget.test.js keeps this complete.
export const TOOL_GROUPS = {
  core: {
    summary: 'Project, scenes, templates, skills, brand, validation, review frames, rendering and undo.',
    tools: ['project_get', 'project_update', 'scene_get', 'scene_create', 'scene_update', 'scene_replace', 'scene_delete', 'scene_duplicate', 'scene_reorder', 'catalog', 'validate', 'style_set', 'quality_review', 'variation_generate', 'template_list', 'template_apply', 'template_set_control', 'template_poster', 'animation_plugin_list', 'skill_list', 'skill_get', 'brand_kit_list', 'brand_kit_get', 'render_frame', 'render_preview', 'render_scene', 'transition_preview', 'review_clip', 'review_contact_sheet', 'assemble', 'history_list', 'history_undo', 'history_redo'],
  },
  screen: {
    summary: 'Screen recordings: camera shots and moves, framing, presentation and source timing.',
    tools: ['camera_set_shots', 'camera_apply_move', 'camera_frame_areas', 'camera_style', 'screen_set', 'screen_match_preview', 'screen_match', 'source_timeline', 'source_set_moments', 'source_trim', 'source_skip_wait', 'source_hold_result'],
  },
  composition: {
    summary: 'Component layers inside a scene: add, replace, retime, bind and lock.',
    tools: ['component_list', 'component_add', 'component_set_input', 'component_replace', 'component_retime', 'component_bind_anchor', 'component_lock', 'composition_retime'],
  },
  media: {
    summary: 'Importing artwork and assets, backgrounds, brand bookends, plugins and film previews.',
    tools: ['artwork_import', 'asset_import', 'background_list', 'background_apply', 'brand_bookend_apply', 'plugin_install', 'plugin_enable', 'plugin_status', 'film_preview', 'film_preview_status'],
  },
  brief: {
    summary: 'The saved brief: decisions, open questions and the structured interview.',
    tools: ['brief_get', 'brief_update', 'brief_decision_set', 'brief_question_set', 'brief_interview_start', 'brief_interview_finish'],
  },
  review: {
    summary: 'Recorded reviews and the reference and pattern knowledge base.',
    tools: ['review_record', 'review_get', 'knowledge_search', 'knowledge_reference_set', 'knowledge_pattern_set'],
  },
};

export const groupOf = (name) => Object.keys(TOOL_GROUPS).find((group) => TOOL_GROUPS[group].tools.includes(name));
