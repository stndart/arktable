class FilterManager {
    constructor(fileManager, isAdmin = true) {
        this.fileManager = fileManager;
        this.filters = {};
        this.isAdmin = isAdmin;

        this.toggleFilterButton = this.toggleFilterButton.bind(this);

        this.lastScrollPos = 0;
        this.initFilters();
        this.loadFilterState();
        this.setupScrollBehavior();
    }

    initFilters() {
        this.setupCoreFilters();
        this.setupFilterEvents();
        this.setupSearch();
        this.setupStatePersistence();
    }

    setupCoreFilters() {
        console.log(`isAdmin ${this.isAdmin}`);
        if (this.isAdmin) {
            // Indexed filter
            this.createFilterOptions('indexed');
        } else {
            this.createFilterOptions('mastery', ['E2', 'M3', 'M6', 'M9']);
        }

        // Add individual rarity filters
        this.createFilterOptions('rarity', ['2', '3', '4', '5', '6']);

        // Add class filters
        this.createFilterOptions('class', ['caster', 'defender', 'guard', 'medic', 'sniper', 'specialist', 'supporter', 'vanguard']);

        // Extra filters
        // TODO
    }

    createFilterOptions(filterName, values = []) {
        this.filters[filterName] = { state: 'neutral', mode: values.length == 0 ? 'tristate' : 'twostate', values: [] };

        if (['class', 'rarity', 'indexed', 'mastery'].includes(filterName))
            return;

        console.log("PANIC!!");
        const container = document.getElementById('extraFilters');
        values.forEach(value => {
            const option = document.createElement('div');
            option.className = 'filter-option';
            option.dataset.filter = filterName;
            option.dataset.value = value;
            option.textContent = filterName + ": " + value;
            container.appendChild(option);
        });
    }

    toggleFilterButton(e) {
        const item = e.currentTarget;

        const filterName = item.dataset.filter;
        const currentState = item.dataset.state;
        const filterValue = item.dataset.value;
        // console.log("clicked on", filterName, currentState, filterValue);
        // console.log(this.filters);
        // console.log(this.filters[filterName]);

        if (this.filters[filterName].mode == 'tristate') {
            const newState = this.getNextState(currentState);

            this.updateFilterState(filterName, newState);
            this.renderFilterState(item, newState);
        } else { // filter group
            const newState = this.getNextState(currentState, 2);
            if (newState == 'neutral') {
                this.filters[filterName].values = this.filters[filterName].values.filter(item => item !== filterValue);
            } else {
                this.filters[filterName].values = this.filters[filterName].values.filter(item => item !== filterValue);
                this.filters[filterName].values.push(filterValue);
            }
            this.updateFilterState(filterName, this.filters[filterName].values.length == 0 ? 'neutral' : 'forced');

            // treat mastery exactly like class
            if (item.matches('.class-filter-item, .mastery-filter-item')) {
                this.renderClassFilterState(item, newState);
            } else {
                this.renderFilterState(item, newState);
            }
        }

    }

    setupFilterEvents() {
        // Toggle filter states
        document.querySelectorAll('.filter-item, .class-filter-item, .mastery-filter-item').forEach(item => {
            item.removeEventListener('click', this.toggleFilterButton);
            item.addEventListener('click', this.toggleFilterButton);
        });

        // Handle dropdown filter selection
        // document.getElementById('extraFilters').addEventListener('click', (e) => {
        //     const option = e.target.closest('.filter-option');
        //     if (!option) return;

        //     const filterName = option.dataset.filter;
        //     const value = option.dataset.value;
        //     this.toggleFilterValue(filterName, value);
        //     this.applyFilters();
        // });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-dropdown')) {
                document.getElementById('extraFilters').classList.remove('active');
            }
        });
    }

    getNextState(currentState, N = 3) {
        let states = ['neutral', 'forced', 'discarded'];
        if (N == 2)
            states = ['neutral', 'forced'];

        const currentIndex = states.indexOf(currentState);
        return states[(currentIndex + 1) % states.length];
    }

    updateFilterState(filterName, newState) {
        try {
            if (!this.filters[filterName]) {
                console.error(`Filter ${filterName} not found`);
                return;
            }

            this.filters[filterName].state = newState;
            this.applyFilters();
            this.saveFilterState();
        } catch (error) {
            console.error('Error updating filter state:', error);
        }
    }

    filterOut(originalFiles) {
        if (!originalFiles || !originalFiles.length) return [];

        return originalFiles.filter(file => {
            return Object.entries(this.filters).every(([filterName, filter]) => {
                if (!filter || filter.state === 'neutral') return true;

                const fileValue = this.getFileValue(filterName, file);

                if (filterName == 'mastery' && filter.state == 'forced') {
                    const MASTERYOPTIONS = ['e2', 'm3', 'm6', 'm9'];
                    return filter.values.includes(MASTERYOPTIONS[fileValue]);
                }
                switch (filter.state) {
                    case 'forced':
                        return filter.values.length === 0
                            ? (fileValue !== undefined && !!fileValue)
                            : filter.values.includes(fileValue);
                    case 'discarded':
                        return filter.values.length === 0
                            ? (fileValue === undefined || !fileValue)
                            : !filter.values.includes(fileValue);
                    default:
                        return true;
                }
            });
        });
    }

    applyFilters() {
        if (!this.fileManager.originalFiles.length) return;

        const filteredFiles = this.filterOut(this.fileManager.originalFiles);
        // console.log(filteredFiles.length);

        this.fileManager.renderFiles(filteredFiles);
    }

    getFileValue(filterName, file) {
        const metadata = file.metadata || file;
        switch (filterName) {
            case 'class': return metadata.class;
            case 'indexed': return !!file.indexed;
            case 'mastery': {
                const marks = this.fileManager.trueState?.marks?.[metadata.id]?.circles ?? -1;
                if (marks != 0) return marks;
                return this.fileManager.trueState?.marks?.[metadata.id]?.checks ? 0 : -1;
            }
            default: return metadata[filterName]?.toString();
        }
    }

    setupScrollBehavior() {
        let ticking = false;

        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    handleScroll() {
        const currentScroll = window.pageYOffset;
        const panel = document.getElementById('filterPanel');

        if (window.innerWidth <= 768) {
            if (currentScroll > this.lastScrollPos && currentScroll > 100) {
                panel.classList.add('hidden');
            } else {
                panel.classList.remove('hidden');
            }
        }

        this.lastScrollPos = currentScroll;
    }

    setupStatePersistence() {
        window.addEventListener('beforeunload', () => {
            localStorage.setItem('adminFilters', JSON.stringify(this.filters));
        });
    }

    saveFilterState() {
        localStorage.setItem('adminFilters', JSON.stringify(this.filters));
    }

    loadFilterState() {
        const savedState = localStorage.getItem('adminFilters');
        if (!savedState) return;

        try {
            const parsed = JSON.parse(savedState);
            if (!this.filters) this.filters = {};
            Object.assign(this.filters, this.reconstructFilters(parsed));
            this.applyFilters();
        } catch (error) {
            console.error('Failed to load filters:', error);
            localStorage.removeItem('adminFilters');
        }
    }

    clearFilterState() {
        // Reset all filter states
        Object.keys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];

            // Reset state machine
            filter.state = 'neutral';

            // Clear any stored values for group filters
            if (filter.mode === 'twostate') {
                filter.values = [];
            }
        });

        // Update UI components
        this.renderAllFilterStates();

        // Apply empty filters to show all items
        this.applyFilters();

        // Persist the cleared state
        this.saveFilterState();

        // Clear visual selections
        document.querySelectorAll('.filter-item, .class-filter-item').forEach(item => {
            item.classList.remove(
                'filter-forced',
                'filter-discarded',
                'filter-active'
            );
            item.dataset.state = 'neutral';
        });

        this.saveFilterState();
    }

    // Properly reconstruct filter objects
    reconstructFilters(parsed) {
        return Object.entries(parsed).reduce((acc, [name, filter]) => {
            acc[name] = {
                mode: filter.mode || 'tristate',
                state: filter.state || 'neutral',
                values: filter.values ? [...filter.values] : []
            };
            return acc;
        }, {});
    }

    renderAllFilterStates() {
        Object.entries(this.filters).forEach(([name, filter]) => {
            const elements = document.querySelectorAll(`
                [data-filter="${name}"][data-value],
                [data-filter="${name}"]:not([data-value])
            `);

            elements.forEach(el => {
                if (filter.mode === 'twostate') {
                    const value = el.dataset.value;
                    const state = filter.values.includes(value) ? 'forced' : 'neutral';
                    this.renderFilterState(el, state);
                } else {
                    this.renderFilterState(el, filter.state);
                }
            });
        });
        this.updateSelectedFiltersDisplay();
    }

    renderFilterState(element, state) {
        if (!element) return;

        element.dataset.state = state;

        // Update visual indicators
        const indicator = element.querySelector('.filter-toggle');
        if (indicator) {
            indicator.textContent = {
                'neutral': '○',
                'forced': '✓',
                'discarded': '✕'
            }[state];
        }

        // Update class-based filters
        if (element.classList.contains('class-filter-item')) {
            element.className = `class-filter-item filter-${state}`;
        }
        if (element.classList.contains('mastery-filter-item')) {
            element.className = `mastery-filter-item filter-${state}`;
        }
    }

    renderClassFilterState(item, state) {
        item.dataset.state = state;

        // Remove all state classes
        item.classList.remove(
            'filter-forced',
            'filter-discarded',
            'filter-neutral'
        );

        // Add new state class
        item.classList.add(`filter-${state}`);
    }

    setupSearch() {
        const searchInput = document.querySelector('.filter-search');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            Array.from(document.getElementById('extraFilters').children).forEach(option => {
                const matches = option.textContent.toLowerCase().includes(searchTerm);
                option.style.display = matches ? 'block' : 'none';
            });
        });

        searchInput.addEventListener('focus', () => {
            document.getElementById('extraFilters').classList.add('active');
        });
    }

    updateSelectedFiltersDisplay() {
        const container = document.getElementById('selectedFilters');
        container.innerHTML = Object.entries(this.filters)
            .filter(([filterName, filter]) => filter.values.length > 0 && !['class', 'indexed', 'rarity', 'mastery'].includes(filterName))
            .map(([name, filter]) =>
                filter.values.map(value => `
            <div class="filter-item" data-filter="${name}" data-value="${value}">
              ${name}: ${value}
              <button class="remove-filter">&times;</button>
            </div>
          `).join('')
            ).join('');

        container.querySelectorAll('.remove-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const filterName = btn.parentElement.dataset.filter;
                const value = btn.parentElement.dataset.value;
                this.toggleFilterValue(filterName, value);
                this.applyFilters();
            });
        });
    }

    sync() {
        this.loadFilterState();
        this.renderAllFilterStates();
    }
}