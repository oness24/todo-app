import django_filters
from django.utils import timezone
from .models import Todo
from django.db import models

class TodoFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(field_name='title', lookup_expr='icontains')
    status = django_filters.ChoiceFilter(
        choices=[('completed', 'Completed'), ('active', 'Active'), ('overdue', 'Overdue')],
        method='filter_by_status'
    )

    class Meta:
        model = Todo
        fields = ['priority', 'completed']

    def filter_by_status(self, queryset, name, value):
        now = timezone.now()
        if value == 'completed':
            return queryset.filter(completed=True)
        elif value == 'active':
            # Active means not completed AND due date is in the future (or no due date)
            return queryset.filter(completed=False).filter(
                models.Q(due_date__gt=now) | models.Q(due_date__isnull=True)
            )
        elif value == 'overdue':
            return queryset.filter(completed=False, due_date__lt=now)
        return queryset 