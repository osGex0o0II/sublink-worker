/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { APP_NAME, GITHUB_REPO, DOCS_URL } from '../constants.js';

export const Navbar = () => {
    return (
        <nav class="fixed top-0 w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800 z-50 transition-all duration-300">
            <div class="container mx-auto px-4">
                <div class="flex items-center justify-between h-16">
                    <a href="#" class="flex items-center gap-2 min-w-0 text-lg sm:text-xl font-bold text-gray-900 dark:text-white hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
                        <img src="/favicon.ico" alt={`${APP_NAME} logo`} class="w-6 h-6" />
                        <span class="truncate">{APP_NAME}</span>
                    </a>
                    <div class="flex items-center gap-1 sm:gap-3 shrink-0">
                        <a
                            href={DOCS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Docs"
                            class="w-9 h-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg sm:rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center sm:gap-2"
                        >
                            <i class="fas fa-book"></i>
                            <span class="hidden sm:inline">Docs</span>
                        </a>
                        <a
                            href={GITHUB_REPO}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="GitHub"
                            class="w-9 h-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 text-gray-700 dark:text-gray-300 rounded-lg sm:rounded-full text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center sm:gap-2 font-medium"
                        >
                            <i class="fab fa-github"></i>
                            <span class="hidden sm:inline">GitHub</span>
                        </a>
                        <button
                            class="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                            x-on:click="toggleDarkMode()"
                            aria-label="Toggle dark mode"
                        >
                            <i class="fas" x-bind:class="darkMode ? 'fa-sun' : 'fa-moon'"></i>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};
