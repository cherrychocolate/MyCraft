import {defineConfig} from 'vite';
export default defineConfig({define:{"process.env.NODE_ENV":JSON.stringify("production")},build:{outDir:'static/editor',emptyOutDir:true,lib:{entry:'frontend/editors.tsx',name:'GlassEditors',formats:['es'],fileName:()=> 'editor.js'},rollupOptions:{output:{assetFileNames:'editor.[ext]'}}}});
