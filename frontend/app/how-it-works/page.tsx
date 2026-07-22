"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";

// Assuming these exist in your project based on the original code
import { SiteNav, ArrowIcon } from "@/components/SiteNav";

// --- DATA ARRAYS ---

const STEPS = [
  {
    num: "01",
    title: "Upload Dataset",
    body: "Securely upload CSV/XLSX files directly into our encrypted environment.",
    badges: ["CSV", "Excel", "Validation"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Dataset Profiling",
    body: "Automatically understand columns, types, distributions, and quality issues.",
    badges: ["Pandas", "Profiling Engine"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "AI Analysis",
    body: "LLM creates a tailored cleaning and analysis strategy from dataset metadata.",
    badges: ["Gemini", "Groq", "LLM Router"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "Smart Cleaning",
    body: "Python executes transformations safely to handle missing values and outliers.",
    badges: ["Missing Values", "Outliers", "Duplicates"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72Z" />
        <path d="m14 7 3 3" />
        <path d="M5 6v4" />
        <path d="M19 14v4" />
        <path d="M10 2v2" />
        <path d="M7 8H3" />
        <path d="M21 16h-4" />
        <path d="M11 3H9" />
      </svg>
    ),
  },
  {
    num: "05",
    title: "Visualization",
    body: "Generate interactive charts and extract actionable insights automatically.",
    badges: ["Charts", "Trends", "Patterns"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  {
    num: "06",
    title: "ML Recommendations",
    body: "Suggest and outline suitable machine learning algorithms based on your data.",
    badges: ["Classification", "Regression", "Clustering"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
      </svg>
    ),
  },
];

const PIPELINE_STAGES = [
  "Raw Dataset",
  "Profiler",
  "AI Brain",
  "Cleaning Engine",
  "Visualization",
  "Insights",
];

const TECH_STACK = [
  {
    category: "Frontend",
    tools: ["Next.js", "TypeScript", "Tailwind", "Framer Motion"],
  },
  {
    category: "Backend",
    tools: ["FastAPI", "Python", "WebSockets"],
  },
  {
    category: "AI Engine",
    tools: ["LangGraph", "LLM Routing", "Gemini", "Groq"],
  },
  {
    category: "Data Layer",
    tools: ["Pandas", "NumPy", "Automated Pipelines"],
  },
];

// --- COMPONENTS ---

const BackgroundGrid = () => (
  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-[0.03]">
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  </div>
);

const FloatingNodes = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute bg-mustard/20 rounded-full blur-3xl"
          style={{
            width: Math.random() * 300 + 100,
            height: Math.random() * 300 + 100,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            x: [0, Math.random() * 100 - 50, 0],
            y: [0, Math.random() * 100 - 50, 0],
          }}
          transition={{
            duration: 10 + Math.random() * 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

export default function HowItWorks() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const lineHeight = useTransform(scrollYProgress, [0.1, 0.8], ["0%", "100%"]);

  return (
    <div className="min-h-screen bg-cream text-ink relative overflow-hidden font-sans selection:bg-mustard/30 selection:text-ink">
      <BackgroundGrid />
      <FloatingNodes />

      <div className="mx-auto w-full max-w-6xl px-6 relative z-10">
        <SiteNav active="How It Works" />

        {/* HERO SECTION */}
        <section className="pt-24 pb-16 md:pt-32 md:pb-24 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/50 backdrop-blur-md px-4 py-1.5 text-xs font-semibold tracking-widest text-ink uppercase mb-8 shadow-sm"
          >
            <span className="h-2 w-2 rounded-full bg-mustard animate-pulse" />
            How It Works
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="display-heading text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-ink max-w-4xl"
          >
            From Raw Data to <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-ink to-ink/60">
              Intelligent Insights
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-lg text-muted max-w-2xl leading-relaxed"
          >
            Data Agent automatically cleans, analyzes, and visualizes your dataset, 
            recommending machine learning approaches with zero manual coding required.
          </motion.p>
        </section>

        {/* ANIMATED DATA FLOW PIPELINE */}
        <section className="py-12 w-full hidden md:block">
          <div className="relative flex items-center justify-between max-w-5xl mx-auto bg-white/30 p-6 rounded-2xl border border-ink/5 backdrop-blur-sm shadow-sm">
            {/* Animated Background Line */}
            <div className="absolute left-6 right-6 top-1/2 h-[2px] bg-ink/10 -translate-y-1/2 z-0" />
            
            {/* Flow Nodes */}
            {PIPELINE_STAGES.map((stage, idx) => (
              <motion.div
                key={stage}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.4 }}
                className="relative z-10 flex flex-col items-center gap-3 group cursor-default"
              >
                <div className="h-10 w-10 rounded-full bg-cream border-2 border-ink/10 flex items-center justify-center shadow-sm group-hover:border-mustard group-hover:shadow-md transition-all duration-300">
                  <div className="h-3 w-3 rounded-full bg-ink/20 group-hover:bg-mustard transition-colors duration-300" />
                </div>
                <span className="text-xs font-semibold text-ink/60 tracking-wide uppercase">
                  {stage}
                </span>
              </motion.div>
            ))}
          </div>
        </section>

        {/* TIMELINE PROCESS */}
        <section className="py-24" ref={containerRef}>
          <div className="relative max-w-4xl mx-auto">
            {/* Center Line for Desktop */}
            <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-[2px] bg-ink/5 -translate-x-1/2 hidden md:block" />
            
            {/* Animated Scroll Line */}
            <motion.div 
              className="absolute left-6 md:left-1/2 top-0 w-[2px] bg-gradient-to-b from-mustard via-mustard to-transparent -translate-x-1/2 hidden md:block z-0"
              style={{ height: lineHeight }}
            />

            <div className="flex flex-col gap-12 md:gap-24">
              {STEPS.map((step, idx) => {
                const isEven = idx % 2 === 0;
                return (
                  <motion.div
                    key={step.num}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className={`relative flex flex-col md:flex-row items-start gap-8 ${
                      isEven ? "md:flex-row-reverse" : ""
                    }`}
                  >
                    {/* Timeline Node (Desktop) */}
                    <div className="hidden md:flex absolute left-1/2 top-6 -translate-x-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-cream border-4 border-white shadow-sm">
                      <span className="h-3 w-3 rounded-full bg-ink" />
                    </div>

                    {/* Content Card */}
                    <div className={`flex-1 w-full ${isEven ? "md:text-right" : ""}`}>
                      <div className={`flex flex-col ${isEven ? "md:items-end" : "items-start"} gap-4 bg-white/40 hover:bg-white/60 backdrop-blur-md p-8 rounded-3xl border border-ink/5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.02)] transition-colors duration-300`}>
                        <div className="flex items-center gap-4 mb-2">
                          {!isEven && (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink text-cream">
                              {step.icon}
                            </span>
                          )}
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-mustard">Step {step.num}</span>
                            <h3 className="font-display text-2xl font-bold text-ink">{step.title}</h3>
                          </div>
                          {isEven && (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink text-cream ml-auto md:ml-0">
                              {step.icon}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-base text-muted leading-relaxed max-w-sm">
                          {step.body}
                        </p>
                        
                        <div className={`flex flex-wrap gap-2 mt-2 ${isEven ? "md:justify-end" : ""}`}>
                          {step.badges.map((badge) => (
                            <span key={badge} className="px-3 py-1 text-xs font-medium bg-ink/5 border border-ink/10 rounded-md text-ink/70">
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Spacer for layout */}
                    <div className="hidden md:block flex-1" />
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* UNDER THE HOOD (Technical Section) */}
        <section className="py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-[2.5rem] bg-ink p-8 md:p-16 text-cream relative overflow-hidden shadow-2xl"
          >
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-mustard/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            
            <div className="relative z-10 mb-12">
              <span className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-semibold tracking-widest text-cream uppercase">
                Under The Hood
              </span>
              <h2 className="display-heading mt-6 text-4xl md:text-5xl font-bold">
                Powered by Modern <br /> AI Architecture
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              {TECH_STACK.map((stack, idx) => (
                <motion.div
                  key={stack.category}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 hover:border-mustard/50 transition-all duration-300"
                >
                  <h4 className="text-mustard font-semibold mb-4">{stack.category}</h4>
                  <ul className="space-y-3">
                    {stack.tools.map((tool) => (
                      <li key={tool} className="flex items-center gap-2 text-sm text-cream/80">
                        <svg className="w-4 h-4 text-mustard/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {tool}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* PREMIUM CTA SECTION */}
        <section className="py-24 mb-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="flex flex-col items-center text-center max-w-3xl mx-auto"
          >
            <div className="h-16 w-16 bg-mustard rounded-2xl flex items-center justify-center shadow-lg mb-8 rotate-3 hover:rotate-0 transition-transform duration-300">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            
            <h2 className="display-heading text-4xl sm:text-5xl font-bold text-ink mb-6">
              Ready to transform your data?
            </h2>
            <p className="text-lg text-muted mb-10 max-w-xl">
              Upload your dataset and let AI discover insights, clean your data, and recommend models automatically.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <Link 
                href="/upload" 
                className="w-full sm:w-auto px-8 py-4 bg-ink text-cream rounded-full font-semibold text-base hover:bg-ink/90 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2"
              >
                Upload Dataset
                <ArrowIcon />
              </Link>
              <Link 
                href="/demo" 
                className="w-full sm:w-auto px-8 py-4 bg-transparent border-2 border-ink/10 text-ink rounded-full font-semibold text-base hover:border-ink/30 hover:bg-ink/5 transition-all duration-300 flex items-center justify-center"
              >
                View Demo
              </Link>
            </div>
          </motion.div>
        </section>
        
      </div>
    </div>
  );
}