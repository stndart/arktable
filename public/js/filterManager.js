class FilterManager {
    constructor(fileManager) {
        this.fileManager = fileManager;
        this.filters = {};

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
        // Indexed filter
        this.createFilterOptions('indexed');

        // Add individual rarity filters
        this.createFilterOptions('rarity', ['2', '3', '4', '5', '6']);

        // Add class filters
        this.createFilterOptions('class', ['caster', 'defender', 'guard', 'medic', 'sniper', 'specialist', 'supporter', 'vanguard']);

        // Extra filters
        // TODO
    }

    createFilterOptions(filterName, values = []) {
        this.filters[filterName] = { state: 'neutral', mode: values.length == 0 ? 'tristate' : 'twostate', values: [] };

        if (['class', 'rarity', 'indexed'].includes(filterName))
            return;
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
        // if (item.classList.contains('filter-toggle')) return;

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

            if (item.matches('.class-filter-item'))
                this.renderClassFilterState(item, newState);
            else
                this.renderFilterState(item, newState);
        }
    }

    setupFilterEvents() {
        console.log("SetupFilterEvents");

        // Toggle filter states
        document.querySelectorAll('.filter-item, .class-filter-item').forEach(item => {
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
        // console.log("update filter", filterName, newState);

        this.filters[filterName].state = newState;
        this.applyFilters();
        this.saveFilterState();
    }

    filterOut(originalFiles) {
        return originalFiles.filter(file => {
            return Object.entries(this.filters).every(([filterName, filter]) => {
                if (filter === 'neutral') return true;

                const fileValue = this.getFileValue(filterName, file);

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
        const filteredFiles = this.filterOut(this.fileManager.originalFiles);
        // console.log(filteredFiles.length);

        this.fileManager.renderFiles(filteredFiles);
    }

    getFileValue(filterName, file) {
        const metadata = file.metadata || file;
        switch (filterName) {
            case 'class': return metadata.class;
            case 'indexed': return !!file.indexed;
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
        if (savedState) {
            this.filters = JSON.parse(savedState);
            this.applyFilters();
            this.renderAllFilterStates();
        }
    }

    renderAllFilterStates() {
        Object.entries(this.filters).forEach(([filterName, filter]) => {
            const items = document.querySelectorAll(`
                .filter-item[data-filter="${filterName}"],
                .class-filter-item[data-filter="${filterName}"]
            `);
            items.forEach((item) => {
                // Determine state based on filter mode
                let state;
                if (filter.mode === 'twostate') { // Group with multiple values
                    const value = item.dataset.value;
                    state = filter.values.includes(value) ? 'forced' : 'neutral';
                } else { // Tristate filters like indexed
                    state = filter.state;
                }
                this.renderFilterState(item, state);
            });
        });
        this.updateSelectedFiltersDisplay();
    }

    renderFilterState(item, state) {
        item.dataset.state = state;
        const toggle = item.querySelector('.filter-toggle');
        if (toggle) {
          toggle.textContent = state === 'forced' 
            ? '✓' : state === 'discarded' ? '✕' : '○';
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
            .filter(([filterName, filter]) => filter.values.length > 0 && !['class', 'indexed', 'rarity'].includes(filterName))
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
}