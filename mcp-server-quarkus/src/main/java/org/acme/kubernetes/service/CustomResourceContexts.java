package org.acme.kubernetes.service;

import io.fabric8.kubernetes.client.dsl.base.ResourceDefinitionContext;

public final class CustomResourceContexts {

    public static final ResourceDefinitionContext VPA_CONTEXT = new ResourceDefinitionContext.Builder()
            .withVersion("v1")
            .withKind("VerticalPodAutoscaler")
            .withGroup("autoscaling.k8s.io")
            .withPlural("verticalpodautoscalers")
            .build();

    public static final ResourceDefinitionContext MACHINE_SET_CONTEXT = new ResourceDefinitionContext.Builder()
            .withVersion("v1beta1")
            .withKind("MachineSet")
            .withGroup("machine.openshift.io")
            .withPlural("machinesets")
            .build();

    private CustomResourceContexts() {
    }
}
