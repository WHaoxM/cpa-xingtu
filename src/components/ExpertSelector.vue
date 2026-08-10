<template>
  <div class="expert-selector">
    <div class="expert-selector__header">
      <div class="expert-selector__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-btn', { 'tab-btn--active': activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="expert-selector__search">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索专家名称或描述..."
          class="search-input"
        />
      </div>
    </div>

    <div class="expert-selector__categories">
      <button
        v-for="cat in categories"
        :key="cat.id"
        :class="['cat-btn', { 'cat-btn--active': activeCategory === cat.id }]"
        @click="activeCategory = cat.id"
      >
        {{ cat.label }}
      </button>
    </div>

    <div class="expert-selector__grid">
      <div
        v-for="expert in filteredExperts"
        :key="expert.id"
        :class="['expert-card', { 'expert-card--selected': selectedExpert?.id === expert.id }]"
        @click="selectExpert(expert)"
      >
        <div class="expert-card__avatar">
          <img v-if="expert.avatar" :src="expert.avatar" :alt="expert.name" />
          <span v-else>{{ expert.name.charAt(0) }}</span>
        </div>
        <div class="expert-card__info">
          <h4 class="expert-card__name">{{ expert.name }}</h4>
          <p class="expert-card__title">{{ expert.title }}</p>
          <p class="expert-card__desc">{{ expert.description }}</p>
          <div class="expert-card__tags">
            <span v-for="tag in expert.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedExpert" class="expert-selector__footer">
      <button class="btn btn--primary" @click="confirmSelection">
        使用 {{ selectedExpert.name }}
      </button>
      <button class="btn btn--secondary" @click="cancelSelection">
        取消
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Expert {
  id: string
  name: string
  title: string
  description: string
  avatar?: string
  tags: string[]
  category: string
}

const emit = defineEmits<{
  (e: 'select', expert: Expert): void
  (e: 'cancel'): void
}>()

const tabs = [
  { id: 'experts', label: 'Experts' },
  { id: 'teams', label: 'Expert Teams' },
]

const categories = [
  { id: 'all', label: 'All' },
  { id: 'hr', label: 'HR' },
  { id: 'tech', label: 'Engineering' },
  { id: 'career', label: 'Career' },
  { id: 'product', label: 'Product Design' },
]

const activeTab = ref('experts')
const activeCategory = ref('all')
const searchQuery = ref('')
const selectedExpert = ref<Expert | null>(null)

const experts = ref<Expert[]>([])

const filteredExperts = computed(() => {
  let result = experts.value

  if (activeCategory.value !== 'all') {
    result = result.filter((e) => e.category === activeCategory.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.title.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query)
    )
  }

  return result
})

function selectExpert(expert: Expert) {
  selectedExpert.value = expert
}

function confirmSelection() {
  if (selectedExpert.value) {
    emit('select', selectedExpert.value)
  }
}

function cancelSelection() {
  selectedExpert.value = null
  emit('cancel')
}

onMounted(async () => {
  try {
    const { listRoles } = await import('@/api/roles')
    const data = await listRoles()
    experts.value = (data.roles || []).map((role: any) => ({
      id: role.id,
      name: role.name,
      title: role.title,
      description: role.expertise,
      tags: role.expertise.split(',').slice(0, 2).map((s: string) => s.trim()),
      category: role.id.includes('hr') ? 'hr' : role.id.includes('engineer') ? 'tech' : 'career',
    }))
  } catch (e) {
    console.error('Failed to load experts:', e)
  }
})
</script>

<style scoped>
.expert-selector {
  background: var(--color-bg-page, #f5f7fa);
  border-radius: 12px;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.expert-selector__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.expert-selector__tabs {
  display: flex;
  gap: 8px;
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn--active {
  background: var(--color-primary, #409eff);
  color: white;
}

.expert-selector__search {
  flex: 1;
  max-width: 300px;
  margin-left: 20px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #dcdfe6);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--color-primary, #409eff);
}

.expert-selector__categories {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.cat-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border, #dcdfe6);
  border-radius: 6px;
  background: white;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.cat-btn--active {
  border-color: var(--color-primary, #409eff);
  color: var(--color-primary, #409eff);
  background: color-mix(in srgb, var(--color-primary) 10%, white);
}

.expert-selector__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.expert-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.expert-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.expert-card--selected {
  border-color: var(--color-primary, #409eff);
  background: color-mix(in srgb, var(--color-primary) 5%, white);
}

.expert-card__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary, #409eff), #67c23a);
  color: white;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  overflow: hidden;
}

.expert-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.expert-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.expert-card__title {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.expert-card__desc {
  font-size: 12px;
  color: var(--color-text-tertiary, #999);
  line-height: 1.4;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.expert-card__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  padding: 4px 8px;
  background: var(--color-bg-tag, #f0f2f5);
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.expert-selector__footer {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border, #e4e7ed);
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn--primary {
  background: var(--color-primary, #409eff);
  color: white;
}

.btn--primary:hover {
  background: color-mix(in srgb, var(--color-primary) 90%, black);
}

.btn--secondary {
  background: white;
  border: 1px solid var(--color-border, #dcdfe6);
  color: var(--color-text-secondary);
}

.btn--secondary:hover {
  background: var(--color-bg-page, #f5f7fa);
}
</style>
